const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');

const {
  IntegrationTestEnvironment,
  assertSafeTestMongoUri,
} = require('./testHarness');

let passedAssertions = 0;
let failedAssertions = 0;
const suiteResults = [];

function check(condition, message) {
  if (condition) {
    passedAssertions += 1;
  } else {
    failedAssertions += 1;
    throw new Error(`Assertion failed: ${message}`);
  }
}

function checkEqual(actual, expected, message) {
  if (Object.is(actual, expected)) {
    passedAssertions += 1;
  } else {
    failedAssertions += 1;
    assert.strictEqual(actual, expected, message);
  }
}

function assertNoSensitiveLeak(payload, contextLabel, { allowStudentEmail = false } = {}) {
  const serialized = JSON.stringify(payload);
  if (!allowStudentEmail) {
    check(!/@vvce\.ac\.in/i.test(serialized), `${contextLabel}: must not leak participant @vvce.ac.in email`);
  }
  check(!/"passwordHash"/i.test(serialized), `${contextLabel}: must not leak passwordHash`);
  check(!/"googleSubjectId"/i.test(serialized), `${contextLabel}: must not leak googleSubjectId`);
  check(!/"hiddenTestCases"/i.test(serialized), `${contextLabel}: must not leak hiddenTestCases`);
}

async function runSuite(name, fn) {
  const beforePass = passedAssertions;
  try {
    await fn();
    const count = passedAssertions - beforePass;
    suiteResults.push({ name, status: 'PASS', assertions: count });
    console.log(`[PASS] ${name} (${count} assertions)`);
  } catch (err) {
    suiteResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.stack || err.message}`);
    throw err;
  }
}

async function run() {
  // 0. Database safety guard tests (must block Atlas, non-local, empty, and production-matching URIs)
  await runSuite('Safety Guard: assertSafeTestMongoUri rejects unsafe targets', async () => {
    assert.throws(
      () => assertSafeTestMongoUri('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/codebuddy'),
      /SAFETY_BLOCK/
    );
    passedAssertions += 1;

    assert.throws(
      () => assertSafeTestMongoUri('mongodb://192.168.1.50:27017/codebuddy'),
      /SAFETY_BLOCK/
    );
    passedAssertions += 1;

    const prodSim = 'mongodb://127.0.0.1:27017/codebuddy_prod';
    assert.throws(() => assertSafeTestMongoUri(prodSim, prodSim), /SAFETY_BLOCK/);
    passedAssertions += 1;

    assert.throws(() => assertSafeTestMongoUri(''), /SAFETY_BLOCK/);
    passedAssertions += 1;
  });

  const env = new IntegrationTestEnvironment();
  let volunteerToken = null;
  let volunteerId = null;
  let adminToken = null;
  let baseData = null;

  // Helpers that call real Express endpoints via Supertest
  const loginAdmin = async () => {
    const res = await env.http().post('/api/admin/login').send({
      username: env.seededAdminCredentials.username,
      password: env.seededAdminCredentials.password,
    });
    checkEqual(res.status, 200, 'Admin login HTTP 200');
    checkEqual(res.body.success, true, 'Admin login success true');
    check(typeof res.body.token === 'string' && res.body.token.length > 20, 'Admin JWT issued');
    return res.body.token;
  };

  const provisionAndRegisterStudent = async ({ tag, name, usn, year }) => {
    const tokenKey = `google-id-token-${tag}`;
    const sub = `google-sub-${tag}`;
    const email = `${tag.toLowerCase()}@vvce.ac.in`;

    env.registerGoogleIdentity(tokenKey, {
      payload: {
        sub,
        email,
        email_verified: true,
        name,
        iss: 'https://accounts.google.com',
      },
    });

    const authRes = await env.http().post('/api/auth/google').send({ idToken: tokenKey });
    checkEqual(authRes.status, 200, `Google login ${tag} -> 200`);
    checkEqual(authRes.body.success, true, `Google login ${tag} success`);
    const jwtToken = authRes.body.token;
    const studentId = authRes.body.student?.id;
    check(Boolean(studentId), `Student ${tag} ID returned`);
    env.trackStudentId(studentId);

    if (usn && year) {
      const regRes = await env
        .http()
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ usn, year });
      checkEqual(
        regRes.status,
        200,
        `Register ${tag} (${usn}) -> 200 (got ${regRes.status}: ${JSON.stringify(regRes.body)})`
      );
      checkEqual(regRes.body.student.usn, usn.toUpperCase(), `Registered USN matches for ${tag}`);
      checkEqual(regRes.body.student.year, year, `Registered year matches for ${tag}`);
      checkEqual(regRes.body.student.registrationComplete, true, `registrationComplete true for ${tag}`);
      checkEqual(regRes.body.student.walletBalance, 0, `Initial walletBalance 0 for ${tag}`);
      checkEqual(regRes.body.student.competitionStatus, 'registered', `Initial status registered for ${tag}`);
      return { token: jwtToken, studentId, usn: regRes.body.student.usn, email, tokenKey };
    }

    return { token: jwtToken, studentId, usn: null, email, tokenKey };
  };

  const playOneLevel = async ({
    studentToken,
    usn,
    vToken,
    result,
    expectedDifficulty = null,
    explicitSettle = true,
    expectLevelNumber = null,
    expectedAllocStatus = 201,
  }) => {
    const allocRes = await env
      .http()
      .post('/api/rounds/allocate')
      .set('Authorization', `Bearer ${studentToken}`);
    checkEqual(
      allocRes.status,
      expectedAllocStatus,
      `Allocate L${expectLevelNumber || '?'} for ${usn} -> ${expectedAllocStatus}`
    );
    checkEqual(allocRes.body.round.status, 'ready', `Allocated round status ready for ${usn}`);
    if (expectLevelNumber !== null) {
      checkEqual(allocRes.body.round.levelNumber, expectLevelNumber, `Round levelNumber ${expectLevelNumber}`);
    }
    if (expectedDifficulty) {
      checkEqual(
        allocRes.body.round.question.difficulty,
        expectedDifficulty,
        `Allocated difficulty ${expectedDifficulty} for ${usn}`
      );
    }
    assertNoSensitiveLeak(allocRes.body, `allocate ${usn}`);

    const startRes = await env
      .http()
      .post(`/api/volunteer/students/${usn}/round/start`)
      .set('Authorization', `Bearer ${vToken}`);
    checkEqual(startRes.status, 200, `Start round ${usn} -> 200`);
    checkEqual(startRes.body.round.status, 'inProgress', `Round inProgress for ${usn}`);

    const evalRes = await env
      .http()
      .post(`/api/volunteer/students/${usn}/round/evaluate`)
      .set('Authorization', `Bearer ${vToken}`)
      .send({
        result,
        remarks: `Evaluated ${result} for ${usn}`,
        programmingLanguage: 'javascript',
      });
    checkEqual(evalRes.status, 200, `Evaluate ${result} for ${usn} -> 200`);
    checkEqual(evalRes.body.evaluation.status, result, `Evaluation status ${result} for ${usn}`);

    let settleRes = null;
    if (explicitSettle) {
      settleRes = await env
        .http()
        .post(`/api/volunteer/students/${usn}/round/settle`)
        .set('Authorization', `Bearer ${vToken}`);
      checkEqual(settleRes.status, 200, `Settle ${usn} -> 200`);
    }

    const progRes = await env
      .http()
      .post(`/api/volunteer/students/${usn}/round/progress`)
      .set('Authorization', `Bearer ${vToken}`);
    checkEqual(progRes.status, 200, `Progress ${usn} -> 200`);

    return { allocRes, startRes, evalRes, settleRes, progRes };
  };

  try {
    await env.start();
    baseData = await env.seedBaseData();

    await runSuite('Suite A: Core Auth, Volunteer Provisioning & Student Registration + All 4 Academic Years Allocation', async () => {
      // Check health endpoint
      const healthRes = await env.http().get('/api/health');
      checkEqual(healthRes.status, 200, 'GET /api/health returns 200');
      checkEqual(healthRes.body.status, 'ok', 'Health check status ok');
      checkEqual(healthRes.body.server, 'healthy', 'Health check server healthy');

      // Admin login via both /api/admin/login and /api/auth/admin/login alias
      adminToken = await loginAdmin();
      const aliasAdminRes = await env.http().post('/api/auth/admin/login').send({
        username: env.seededAdminCredentials.username,
        password: env.seededAdminCredentials.password,
      });
      checkEqual(aliasAdminRes.status, 200, 'POST /api/auth/admin/login alias returns 200');

      const adminMeRes = await env
        .http()
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(adminMeRes.status, 200, 'GET /api/admin/me -> 200');

      // Admin creates primary volunteer
      const createVolRes = await env
        .http()
        .post('/api/admin/volunteers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Integration Volunteer One',
          username: 'vol_int_1',
          password: 'VolPassword!123',
          assignedLab: 'CS-Lab-101',
        });
      checkEqual(createVolRes.status, 201, 'POST /api/admin/volunteers -> 201');
      volunteerId = createVolRes.body.volunteer.id;
      env.trackStaffId(volunteerId);

      // Volunteer login via /api/volunteer/login and alias /api/auth/volunteer/login
      const vLoginRes = await env.http().post('/api/volunteer/login').send({
        username: 'vol_int_1',
        password: 'VolPassword!123',
      });
      checkEqual(vLoginRes.status, 200, 'POST /api/volunteer/login -> 200');
      volunteerToken = vLoginRes.body.token;

      const vAliasRes = await env.http().post('/api/auth/volunteer/login').send({
        username: 'vol_int_1',
        password: 'VolPassword!123',
      });
      checkEqual(vAliasRes.status, 200, 'POST /api/auth/volunteer/login alias -> 200');

      // Negative Google Auth tests
      env.registerGoogleIdentity('gmail-token', {
        payload: {
          sub: 'sub-gmail',
          email: 'outsider@gmail.com',
          email_verified: true,
          name: 'Outside User',
          iss: 'https://accounts.google.com',
        },
      });
      const nonCollegeRes = await env.http().post('/api/auth/google').send({ idToken: 'gmail-token' });
      check(nonCollegeRes.status >= 400 && nonCollegeRes.status < 500, 'Rejects non-@vvce.ac.in domain');

      env.registerGoogleIdentity('expired-google-token', { expired: true });
      const expiredGoogleRes = await env
        .http()
        .post('/api/auth/google')
        .send({ idToken: 'expired-google-token' });
      checkEqual(expiredGoogleRes.status, 401, 'Expired Google token rejected 401');

      const missingIdTokenRes = await env.http().post('/api/auth/google').send({});
      checkEqual(missingIdTokenRes.status, 400, 'Empty Google auth payload rejected 400');

      // Unregistered student tries to allocate before completing registration
      const unregistered = await provisionAndRegisterStudent({
        tag: 'unreg',
        name: 'Unregistered Student',
        usn: null,
        year: null,
      });
      const unregAllocRes = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${unregistered.token}`);
      checkEqual(unregAllocRes.status, 403, 'Unregistered student cannot allocate round');

      // Pre-unused Level 6 deactivate + reactivate check before any student reaches Level 6
      const deactL6Res = await env
        .http()
        .patch('/api/admin/levels/6/deactivate')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(deactL6Res.status, 200, 'Unused Level 6 can be deactivated -> 200');
      checkEqual(deactL6Res.body.level.isActive, false, 'Level 6 isActive false after deactivate');

      const reactL6Res = await env
        .http()
        .patch('/api/admin/levels/6/activate')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(reactL6Res.status, 200, 'Level 6 can be reactivated -> 200');
      checkEqual(reactL6Res.body.level.isActive, true, 'Level 6 isActive true after activate');

      // Academic year question allocation rules: 1st Year -> EASY; 2nd/3rd/4th Year -> HARD
      const y1 = await provisionAndRegisterStudent({
        tag: 'yr1check',
        name: 'Year 1 Student',
        usn: '4VV24CS001',
        year: '1st Year',
      });
      const y2 = await provisionAndRegisterStudent({
        tag: 'yr2check',
        name: 'Year 2 Student',
        usn: '4VV23CS002',
        year: '2nd Year',
      });
      const y3 = await provisionAndRegisterStudent({
        tag: 'yr3check',
        name: 'Year 3 Student',
        usn: '4VV22CS003',
        year: '3rd Year',
      });
      const y4 = await provisionAndRegisterStudent({
        tag: 'yr4check',
        name: 'Year 4 Student',
        usn: '4VV21CS004',
        year: '4th Year',
      });

      // Duplicate USN guard
      const dupUsnStudent = await provisionAndRegisterStudent({
        tag: 'dupUsn',
        name: 'Dup USN Candidate',
        usn: null,
        year: null,
      });
      const dupRegRes = await env
        .http()
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${dupUsnStudent.token}`)
        .send({ usn: '4VV24CS001', year: '1st Year' });
      checkEqual(dupRegRes.status, 409, 'Duplicate USN returns 409');
      checkEqual(dupRegRes.body.code, 'DUPLICATE_USN', 'Duplicate USN code matches');

      // Allocate concurrent check on y1 (two parallel POST /api/rounds/allocate -> single DB Round!)
      const [allocY1A, allocY1B] = await Promise.all([
        env.http().post('/api/rounds/allocate').set('Authorization', `Bearer ${y1.token}`),
        env.http().post('/api/rounds/allocate').set('Authorization', `Bearer ${y1.token}`),
      ]);
      check(
        [200, 201].includes(allocY1A.status) && [200, 201].includes(allocY1B.status),
        'Concurrent allocation requests resolve cleanly'
      );
      checkEqual(
        allocY1A.body.round.id,
        allocY1B.body.round.id,
        'Concurrent allocations return identical Round ID'
      );
      const y1RoundsCount = await env.models.Round.countDocuments({ studentId: y1.studentId, levelNumber: 1 });
      checkEqual(y1RoundsCount, 1, 'Exactly one Round document exists in DB after concurrent allocate');
      checkEqual(allocY1A.body.round.question.difficulty, 'EASY', 'Year 1 allocates EASY');
      assertNoSensitiveLeak(allocY1A.body, 'allocate response');

      // Idempotent second sequential allocation returns 200 + isExisting: true
      const idempRes = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${y1.token}`);
      checkEqual(idempRes.status, 200, 'Repeated allocate returns 200');
      checkEqual(idempRes.body.isExisting, true, 'Repeated allocate marks isExisting: true');
      checkEqual(idempRes.body.round.id, allocY1A.body.round.id, 'Same round kept');

      // Year 2, 3, 4 -> HARD
      const allocY2 = await env.http().post('/api/rounds/allocate').set('Authorization', `Bearer ${y2.token}`);
      const allocY3 = await env.http().post('/api/rounds/allocate').set('Authorization', `Bearer ${y3.token}`);
      const allocY4 = await env.http().post('/api/rounds/allocate').set('Authorization', `Bearer ${y4.token}`);
      checkEqual(allocY2.status, 201, 'Year 2 alloc -> 201');
      checkEqual(allocY2.body.round.question.difficulty, 'HARD', 'Year 2 allocates HARD');
      checkEqual(allocY3.status, 201, 'Year 3 alloc -> 201');
      checkEqual(allocY3.body.round.question.difficulty, 'HARD', 'Year 3 allocates HARD');
      checkEqual(allocY4.status, 201, 'Year 4 alloc -> 201');
      checkEqual(allocY4.body.round.question.difficulty, 'HARD', 'Year 4 allocates HARD');

      // Student profile, level-info, and active round endpoint
      const meRes = await env.http().get('/api/auth/me').set('Authorization', `Bearer ${y1.token}`);
      checkEqual(meRes.status, 200, 'GET /api/auth/me -> 200');
      checkEqual(meRes.body.student.currentLevel, 1, 'GET /api/auth/me currentLevel=1');

      const lvlInfoRes = await env
        .http()
        .get('/api/rounds/level-info')
        .set('Authorization', `Bearer ${y1.token}`);
      checkEqual(lvlInfoRes.status, 200, 'GET /api/rounds/level-info -> 200');

      const activeRes = await env.http().get('/api/rounds/active').set('Authorization', `Bearer ${y1.token}`);
      checkEqual(activeRes.status, 200, 'GET /api/rounds/active -> 200');
      checkEqual(activeRes.body.round.status, 'ready', 'Active round status ready');

      // Volunteer lookup + extension + timer expiration DB sync verification
      const lookupRes = await env
        .http()
        .get(`/api/volunteer/students/${y2.usn}/round`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(lookupRes.status, 200, 'Volunteer student USN lookup -> 200');
      assertNoSensitiveLeak(lookupRes.body, 'volunteer lookup', { allowStudentEmail: true });

      const startY2Res = await env
        .http()
        .post(`/api/volunteer/students/${y2.usn}/round/start`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(startY2Res.status, 200, 'Start y2 round -> 200');
      checkEqual(startY2Res.body.round.status, 'inProgress', 'y2 round inProgress');

      const extendRes = await env
        .http()
        .post(`/api/volunteer/students/${y2.usn}/round/extend`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ extensionSeconds: 45, reason: 'Workstation froze briefly' });
      checkEqual(extendRes.status, 200, 'Timer extend -> 200');
      checkEqual(extendRes.body.extensionSeconds, 45, 'Extension seconds reported');
      checkEqual(extendRes.body.round.timerExtensions.length, 1, 'One extension logged');

      // Simulate past deadline in real DB, verify real controller sync transitions to timeExpired
      await env.models.Round.findByIdAndUpdate(startY2Res.body.round.id, {
        $set: { deadline: new Date(Date.now() - 10000) },
      });
      const expiredSyncRes = await env
        .http()
        .get('/api/rounds/active')
        .set('Authorization', `Bearer ${y2.token}`);
      checkEqual(expiredSyncRes.status, 200, 'Active check after deadline -> 200');
      checkEqual(expiredSyncRes.body.round.status, 'timeExpired', 'Controller synced round status to timeExpired in DB');
      const dbY2Round = await env.models.Round.findById(startY2Res.body.round.id).lean();
      checkEqual(dbY2Round.status, 'timeExpired', 'DB Round.status persisted as timeExpired');
    });

    await runSuite('Suite B: Full L1-L6 PASS Journey, L1-L6 FAIL Paths, Safe Zones, Concurrency & History/Transactions', async () => {
      // 1. Full L1 -> L6 PASS champion (2nd year -> HARD throughout)
      const champ = await provisionAndRegisterStudent({
        tag: 'champion',
        name: 'Champion Student',
        usn: '4VV23CS100',
        year: '2nd Year',
      });

      const expectedPassProgression = [
        { lvl: 1, wallet: 50, safeZone: 50, status: 'inProgress', completed: false, explicitSettle: true },
        { lvl: 2, wallet: 100, safeZone: 50, status: 'inProgress', completed: false, explicitSettle: false }, // tests auto-settle during progress!
        { lvl: 3, wallet: 150, safeZone: 50, status: 'inProgress', completed: false, explicitSettle: true },
        { lvl: 4, wallet: 250, safeZone: 250, status: 'inProgress', completed: false, explicitSettle: false },
        { lvl: 5, wallet: 350, safeZone: 250, status: 'inProgress', completed: false, explicitSettle: true },
        { lvl: 6, wallet: 500, safeZone: 250, status: 'completed', completed: true, explicitSettle: true },
      ];

      for (const step of expectedPassProgression) {
        const res = await playOneLevel({
          studentToken: champ.token,
          usn: champ.usn,
          vToken: volunteerToken,
          result: 'PASS',
          expectedDifficulty: 'HARD',
          explicitSettle: step.explicitSettle,
          expectLevelNumber: step.lvl,
        });
        checkEqual(res.progRes.body.student.walletBalance, step.wallet, `Champ L${step.lvl} PASS wallet=${step.wallet}`);
        checkEqual(res.progRes.body.student.safeZoneAmount, step.safeZone, `Champ L${step.lvl} PASS safeZone=${step.safeZone}`);
        checkEqual(res.progRes.body.student.competitionStatus, step.status, `Champ L${step.lvl} PASS status=${step.status}`);
        checkEqual(res.progRes.body.progression.isCompleted, step.completed, `Champ L${step.lvl} isCompleted=${step.completed}`);
        if (!step.explicitSettle) {
          checkEqual(res.progRes.body.settlement.didSettleNow, true, `Auto-settle executed on L${step.lvl}`);
        }
      }

      // Guard: completed student cannot allocate further rounds
      const postCompleteAlloc = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${champ.token}`);
      checkEqual(postCompleteAlloc.status, 409, 'Completed student cannot allocate more rounds -> 409');

      // Student history & ledger transactions for champion
      const histRes = await env
        .http()
        .get('/api/student/rounds/history')
        .set('Authorization', `Bearer ${champ.token}`);
      checkEqual(histRes.status, 200, 'Champion round history -> 200');
      checkEqual(histRes.body.rounds.length, 6, 'Champion has 6 completed rounds in history');

      const txRes = await env
        .http()
        .get('/api/student/transactions')
        .set('Authorization', `Bearer ${champ.token}`);
      checkEqual(txRes.status, 200, 'Champion transactions -> 200');
      checkEqual(txRes.body.transactions.length, 6, 'Champion has 6 immutable ledger transactions');
      checkEqual(txRes.body.walletBalance, 500, 'Champion transactions endpoint walletBalance=500');

      // 2. Duplicate evaluation / settlement / progression & concurrency races on a separate student
      const raceStudent = await provisionAndRegisterStudent({
        tag: 'racer',
        name: 'Race Guard Student',
        usn: '4VV24CS101',
        year: '1st Year',
      });
      const rAlloc = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${raceStudent.token}`);
      checkEqual(rAlloc.status, 201, 'Race student L1 allocated');
      const rStart = await env
        .http()
        .post(`/api/volunteer/students/${raceStudent.usn}/round/start`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(rStart.status, 200, 'Race student L1 started');

      // Concurrent evaluations (only 1 succeeds with 200, 1 gets 409 ROUND_ALREADY_EVALUATED)
      const [evA, evB] = await Promise.all([
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/evaluate`)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .send({ result: 'PASS', remarks: 'Concurrent pass A', programmingLanguage: 'python' }),
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/evaluate`)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .send({ result: 'PASS', remarks: 'Concurrent pass B', programmingLanguage: 'python' }),
      ]);
      const evStatuses = [evA.status, evB.status].sort((a, b) => a - b);
      checkEqual(evStatuses[0], 200, 'Concurrent evaluate: one 200');
      checkEqual(evStatuses[1], 409, 'Concurrent evaluate: second 409');
      const evalDbCount = await env.models.Evaluation.countDocuments({ roundId: rAlloc.body.round.id });
      checkEqual(evalDbCount, 1, 'Exactly 1 Evaluation document exists in DB');

      // Concurrent settlements (only 1 succeeds with 200, second gets 409 ROUND_ALREADY_SETTLED or SETTLEMENT_CONFLICT)
      const [stA, stB] = await Promise.all([
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/settle`)
          .set('Authorization', `Bearer ${volunteerToken}`),
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/settle`)
          .set('Authorization', `Bearer ${volunteerToken}`),
      ]);
      const stStatuses = [stA.status, stB.status].sort((a, b) => a - b);
      checkEqual(stStatuses[0], 200, 'Concurrent settle: one 200');
      checkEqual(stStatuses[1], 409, 'Concurrent settle: second 409');
      const txDbCount = await env.models.Transaction.countDocuments({ roundId: rAlloc.body.round.id });
      checkEqual(txDbCount, 1, 'Exactly 1 Transaction document exists in DB');

      // Sequential duplicate settle check
      const dupSettle = await env
        .http()
        .post(`/api/volunteer/students/${raceStudent.usn}/round/settle`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(dupSettle.status, 409, 'Duplicate settle rejected 409');

      // Concurrent progression (only 1 succeeds with 200, second gets 409)
      const [prA, prB] = await Promise.all([
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/progress`)
          .set('Authorization', `Bearer ${volunteerToken}`),
        env
          .http()
          .post(`/api/volunteer/students/${raceStudent.usn}/round/progress`)
          .set('Authorization', `Bearer ${volunteerToken}`),
      ]);
      const prStatuses = [prA.status, prB.status].sort((a, b) => a - b);
      checkEqual(prStatuses[0], 200, 'Concurrent progress: one 200');
      checkEqual(prStatuses[1], 409, 'Concurrent progress: second 409');
      const racerInDb = await env.models.Student.findById(raceStudent.studentId).lean();
      checkEqual(racerInDb.currentLevel, 2, 'Race student progressed exactly once to level 2');
      checkEqual(racerInDb.walletBalance, 50, 'Race student wallet settled once to 50');

      // 3. Dedicated FAIL tests across ALL six levels (L1..L6) verifying canonical losing payouts & elimination
      const failScenarios = [
        { failAt: 1, expectedWallet: 50, expectedSafeZone: 0 },
        { failAt: 2, expectedWallet: 50, expectedSafeZone: 50 },
        { failAt: 3, expectedWallet: 50, expectedSafeZone: 50 },
        { failAt: 4, expectedWallet: 50, expectedSafeZone: 50 },
        { failAt: 5, expectedWallet: 250, expectedSafeZone: 250 },
        { failAt: 6, expectedWallet: 250, expectedSafeZone: 250 },
      ];

      for (const scenario of failScenarios) {
        const s = await provisionAndRegisterStudent({
          tag: `failL${scenario.failAt}`,
          name: `Fail Level ${scenario.failAt}`,
          usn: `4VV24CS20${scenario.failAt}`,
          year: '1st Year',
        });
        for (let lvl = 1; lvl < scenario.failAt; lvl += 1) {
          await playOneLevel({
            studentToken: s.token,
            usn: s.usn,
            vToken: volunteerToken,
            result: 'PASS',
            expectLevelNumber: lvl,
          });
        }
        const failOutcome = await playOneLevel({
          studentToken: s.token,
          usn: s.usn,
          vToken: volunteerToken,
          result: 'FAIL',
          expectLevelNumber: scenario.failAt,
        });
        checkEqual(
          failOutcome.progRes.body.student.walletBalance,
          scenario.expectedWallet,
          `L${scenario.failAt} FAIL final wallet=${scenario.expectedWallet}`
        );
        checkEqual(
          failOutcome.progRes.body.student.safeZoneAmount,
          scenario.expectedSafeZone,
          `L${scenario.failAt} FAIL safeZone=${scenario.expectedSafeZone}`
        );
        checkEqual(
          failOutcome.progRes.body.student.competitionStatus,
          'eliminated',
          `L${scenario.failAt} FAIL sets competitionStatus='eliminated'`
        );

        // Eliminated student cannot allocate next round
        const blockedAlloc = await env
          .http()
          .post('/api/rounds/allocate')
          .set('Authorization', `Bearer ${s.token}`);
        checkEqual(blockedAlloc.status, 409, `Eliminated L${scenario.failAt} student blocked from allocation -> 409`);
      }
    });

    await runSuite('Suite C: Volunteer Management, Admin Monitoring, Dashboard, Level Config & Guarded Recovery', async () => {
      // 1. Volunteer lifecycle (create, deactivate -> block token, reactivate, reset password)
      const tempVolRes = await env
        .http()
        .post('/api/admin/volunteers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Temp Volunteer Two',
          username: 'vol_temp_2',
          password: 'InitialVolPass!99',
          assignedLab: 'CS-Lab-202',
        });
      checkEqual(tempVolRes.status, 201, 'Create temp volunteer -> 201');
      const tempVolId = tempVolRes.body.volunteer.id;
      env.trackStaffId(tempVolId);

      const tempLogin = await env.http().post('/api/volunteer/login').send({
        username: 'vol_temp_2',
        password: 'InitialVolPass!99',
      });
      checkEqual(tempLogin.status, 200, 'Temp volunteer login -> 200');
      const tempToken = tempLogin.body.token;

      const deactVol = await env
        .http()
        .patch(`/api/admin/volunteers/${tempVolId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(deactVol.status, 200, 'Deactivate temp volunteer -> 200');

      const blockedMe = await env
        .http()
        .get('/api/volunteer/me')
        .set('Authorization', `Bearer ${tempToken}`);
      checkEqual(blockedMe.status, 403, 'Deactivated volunteer existing JWT immediately blocked -> 403');

      const reactVol = await env
        .http()
        .patch(`/api/admin/volunteers/${tempVolId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(reactVol.status, 200, 'Reactivate temp volunteer -> 200');

      const resetPw = await env
        .http()
        .patch(`/api/admin/volunteers/${tempVolId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'RotatedVolPass!2026' });
      checkEqual(resetPw.status, 200, 'Reset volunteer password -> 200');

      const oldPwFail = await env.http().post('/api/volunteer/login').send({
        username: 'vol_temp_2',
        password: 'InitialVolPass!99',
      });
      checkEqual(oldPwFail.status, 401, 'Old password fails after reset -> 401');

      const newPwOk = await env.http().post('/api/volunteer/login').send({
        username: 'vol_temp_2',
        password: 'RotatedVolPass!2026',
      });
      checkEqual(newPwOk.status, 200, 'New password succeeds after reset -> 200');

      // 2. Question Bank CRUD
      const qCreate = await env
        .http()
        .post('/api/admin/questions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Custom Graph Test',
          statement: 'Compute shortest path length across weighted edges in connected directed graph.',
          constraints: ['1 <= V <= 100'],
          examples: [{ id: '1', title: 'Sample', input: '3 2', output: '5', explanation: 'Sum.' }],
          difficulty: 'EASY',
          levelNumber: 1,
          hiddenTestCases: [{ input: '10 20', expectedOutput: '30' }],
        });
      checkEqual(qCreate.status, 201, 'Admin create question -> 201');
      const customQId = qCreate.body.question.id;
      env.createdTracker.questionIds.add(customQId);

      const qDeact = await env
        .http()
        .patch(`/api/admin/questions/${customQId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(qDeact.status, 200, 'Admin deactivate question -> 200');

      const qReact = await env
        .http()
        .patch(`/api/admin/questions/${customQId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(qReact.status, 200, 'Admin reactivate question -> 200');

      // 3. Guarded Abandoned Round Recovery (POST /api/admin/rounds/:roundId/recover)
      const recStudent = await provisionAndRegisterStudent({
        tag: 'recovery_user',
        name: 'Recovery Target Student',
        usn: '4VV24CS301',
        year: '1st Year',
      });
      const recAlloc = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${recStudent.token}`);
      checkEqual(recAlloc.status, 201, 'Allocated round for recovery scenario -> 201');
      const recRoundId = recAlloc.body.round.id;

      // Trying to recover an active non-abandoned round -> 409 ROUND_NOT_ABANDONED
      const nonAbandRes = await env
        .http()
        .post(`/api/admin/rounds/${recRoundId}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(nonAbandRes.status, 409, 'Recovering non-abandoned round rejected 409');
      checkEqual(nonAbandRes.body.code, 'ROUND_NOT_ABANDONED', 'Code ROUND_NOT_ABANDONED');

      // Mark round abandoned in DB (no evaluation, no transaction) and also mark student abandoned-like state?
      // Student stays registered/inProgress; round becomes abandoned
      await env.models.Round.findByIdAndUpdate(recRoundId, { $set: { status: 'abandoned' } });

      // Invalid ObjectId -> 400; missing ObjectId -> 404
      const badIdRec = await env
        .http()
        .post('/api/admin/rounds/not-an-object-id/recover')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(badIdRec.status, 400, 'Invalid ObjectId on recover -> 400');

      const missingIdRec = await env
        .http()
        .post(`/api/admin/rounds/${new mongoose.Types.ObjectId().toString()}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(missingIdRec.status, 404, 'Nonexistent roundId on recover -> 404');

      // Concurrent recovery test: two parallel POST /recover -> 1 wins (200), 1 conflicts (409)
      const [recA, recB] = await Promise.all([
        env
          .http()
          .post(`/api/admin/rounds/${recRoundId}/recover`)
          .set('Authorization', `Bearer ${adminToken}`),
        env
          .http()
          .post(`/api/admin/rounds/${recRoundId}/recover`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);
      const recStatuses = [recA.status, recB.status].sort((a, b) => a - b);
      checkEqual(recStatuses[0], 200, 'Concurrent recovery: one 200');
      checkEqual(recStatuses[1], 409, 'Concurrent recovery: second 409');
      const okRecBody = recA.status === 200 ? recA.body : recB.body;
      checkEqual(okRecBody.round.id, recRoundId, 'Recovered round preserved exact same _id');
      checkEqual(okRecBody.round.status, 'ready', 'Recovered round reset to ready');
      checkEqual(
        okRecBody.round.question.id,
        recAlloc.body.round.question.id,
        'Recovered round preserved original questionId'
      );

      // Verify recovered round returns as existing ready round (200) and completes & settles cleanly
      const recPlay = await playOneLevel({
        studentToken: recStudent.token,
        usn: recStudent.usn,
        vToken: volunteerToken,
        result: 'PASS',
        expectLevelNumber: 1,
        expectedAllocStatus: 200,
      });
      checkEqual(recPlay.allocRes.body.isExisting, true, 'Recovered round returned via existing ready round');
      checkEqual(recPlay.allocRes.body.round.id, recRoundId, 'Re-allocated recovered round preserves _id');
      checkEqual(recPlay.progRes.body.student.walletBalance, 50, 'Recovered round completes and settles cleanly');

      // 4. Admin Level Config + Locking after competition usage
      const levelsRes = await env
        .http()
        .get('/api/admin/levels')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(levelsRes.status, 200, 'GET /api/admin/levels -> 200');
      checkEqual(levelsRes.body.levels.length, 6, 'All 6 levels returned');
      const lvl1 = levelsRes.body.levels.find((l) => l.number === 1);
      checkEqual(lvl1.isUsedInCompetition, true, 'Level 1 flagged isUsedInCompetition=true');

      const lockUpdateRes = await env
        .http()
        .put('/api/admin/levels/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ winningPayout: 999 });
      checkEqual(lockUpdateRes.status, 409, 'Modifying financial field on used Level 1 returns 409');
      checkEqual(lockUpdateRes.body.code, 'LEVEL_CONFIGURATION_LOCKED', 'Code LEVEL_CONFIGURATION_LOCKED');

      const safeDescUpdate = await env
        .http()
        .put('/api/admin/levels/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Level 1 Updated Name', durationSeconds: 200 });
      checkEqual(safeDescUpdate.status, 200, 'Non-financial name/duration update allowed -> 200');

      const deactUsedL1 = await env
        .http()
        .patch('/api/admin/levels/1/deactivate')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(deactUsedL1.status, 409, 'Deactivating in-use Level 1 blocked with 409');

      // 5. Admin Monitoring (read-only + zero email leak) & Dashboard
      const txBefore = await env.models.Transaction.countDocuments({});
      const rndBefore = await env.models.Round.countDocuments({});

      const [dashRes, partsRes, partDetailRes, roundsMonRes, txMonRes] = await Promise.all([
        env.http().get('/api/admin/dashboard').set('Authorization', `Bearer ${adminToken}`),
        env.http().get('/api/admin/participants?page=1&limit=10').set('Authorization', `Bearer ${adminToken}`),
        env.http().get('/api/admin/participants/4VV23CS100').set('Authorization', `Bearer ${adminToken}`),
        env.http().get('/api/admin/rounds?page=1&limit=20').set('Authorization', `Bearer ${adminToken}`),
        env.http().get('/api/admin/transactions?page=1&limit=20').set('Authorization', `Bearer ${adminToken}`),
      ]);

      checkEqual(dashRes.status, 200, 'GET /api/admin/dashboard -> 200');
      checkEqual(partsRes.status, 200, 'GET /api/admin/participants -> 200');
      checkEqual(partDetailRes.status, 200, 'GET /api/admin/participants/:usn -> 200');
      checkEqual(roundsMonRes.status, 200, 'GET /api/admin/rounds -> 200');
      checkEqual(txMonRes.status, 200, 'GET /api/admin/transactions -> 200');

      assertNoSensitiveLeak(dashRes.body, 'admin dashboard');
      assertNoSensitiveLeak(partsRes.body, 'admin participants');
      assertNoSensitiveLeak(partDetailRes.body, 'admin participant details');
      assertNoSensitiveLeak(roundsMonRes.body, 'admin rounds');
      assertNoSensitiveLeak(txMonRes.body, 'admin transactions');

      // Cross-check Dashboard aggregates against real DB state
      const dbCompletedStudents = await env.models.Student.countDocuments({ competitionStatus: 'completed' });
      const dbEliminatedStudents = await env.models.Student.countDocuments({ competitionStatus: 'eliminated' });
      checkEqual(
        dashRes.body.dashboard.participants.completed,
        dbCompletedStudents,
        'Dashboard completed count matches DB'
      );
      checkEqual(
        dashRes.body.dashboard.participants.eliminated,
        dbEliminatedStudents,
        'Dashboard eliminated count matches DB'
      );
      checkEqual(dashRes.body.dashboard.transactions.total, txBefore, 'Dashboard tx count matches DB');
      checkEqual(dashRes.body.dashboard.rounds.total, rndBefore, 'Dashboard rounds count matches DB');

      const txAfter = await env.models.Transaction.countDocuments({});
      const rndAfter = await env.models.Round.countDocuments({});
      checkEqual(txAfter, txBefore, 'Monitoring did not mutate Transactions');
      checkEqual(rndAfter, rndBefore, 'Monitoring did not mutate Rounds');
    });

    await runSuite('Suite D: Leaderboard Integration (Student, Volunteer & Admin)', async () => {
      // Pick champion student or create quick student token? We can mint or use an existing active student token:
      // Let's register one student in Suite D for calling Student leaderboard + /me cleanly
      const lbStudent = await provisionAndRegisterStudent({
        tag: 'lb_viewer',
        name: 'Leaderboard Viewer',
        usn: '4VV24CS401',
        year: '1st Year',
      });

      for (const [role, tok] of [
        ['STUDENT', lbStudent.token],
        ['VOLUNTEER', volunteerToken],
        ['ADMIN', adminToken],
      ]) {
        const lbRes = await env
          .http()
          .get('/api/leaderboard?page=1&limit=10')
          .set('Authorization', `Bearer ${tok}`);
        checkEqual(lbRes.status, 200, `GET /api/leaderboard as ${role} -> 200`);
        check(Array.isArray(lbRes.body.leaderboard), `Leaderboard array returned for ${role}`);
        check(lbRes.body.leaderboard.length >= 1, `Leaderboard populated for ${role}`);
        checkEqual(lbRes.body.leaderboard[0].usn, '4VV23CS100', `Champion USN ranks #1 for ${role}`);
        assertNoSensitiveLeak(lbRes.body, `leaderboard (${role})`);

        const recRes = await env
          .http()
          .get('/api/competition/records')
          .set('Authorization', `Bearer ${tok}`);
        checkEqual(recRes.status, 200, `GET /api/competition/records as ${role} -> 200`);
        assertNoSensitiveLeak(recRes.body, `records (${role})`);
      }

      const meLbOk = await env
        .http()
        .get('/api/leaderboard/me')
        .set('Authorization', `Bearer ${lbStudent.token}`);
      checkEqual(meLbOk.status, 200, 'GET /api/leaderboard/me as Student -> 200');

      const meLbVolBlock = await env
        .http()
        .get('/api/leaderboard/me')
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(meLbVolBlock.status, 403, 'GET /api/leaderboard/me as Volunteer -> 403');

      const meLbAdminBlock = await env
        .http()
        .get('/api/leaderboard/me')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(meLbAdminBlock.status, 403, 'GET /api/leaderboard/me as Admin -> 403');
    });

    await runSuite('Suite E: Task 5 Security Middleware, RBAC, Validation & Real Rate-Limiting Negative Tests', async () => {
      // 1. Missing, malformed, expired, not-before, invalid-sub, and wrong-role JWTs
      const noAuth = await env.http().get('/api/admin/dashboard');
      checkEqual(noAuth.status, 401, 'Missing Authorization header -> 401');

      const badJwt = await env
        .http()
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      checkEqual(badJwt.status, 401, 'Malformed JWT -> 401');

      const expiredJwt = jwt.sign(
        { sub: new mongoose.Types.ObjectId().toString(), role: 'ADMIN' },
        process.env.JWT_SECRET,
        { expiresIn: -60 }
      );
      const expRes = await env
        .http()
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${expiredJwt}`);
      checkEqual(expRes.status, 401, 'Expired JWT -> 401');

      const futureJwt = jwt.sign(
        { sub: new mongoose.Types.ObjectId().toString(), role: 'ADMIN' },
        process.env.JWT_SECRET,
        { notBefore: 3600, expiresIn: 7200 }
      );
      const nbfRes = await env
        .http()
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${futureJwt}`);
      checkEqual(nbfRes.status, 401, 'Future nbf JWT -> 401');

      const badSubJwt = jwt.sign(
        { sub: 'not-a-mongo-objectid', role: 'ADMIN' },
        process.env.JWT_SECRET,
        { expiresIn: 300 }
      );
      const badSubRes = await env
        .http()
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${badSubJwt}`);
      checkEqual(badSubRes.status, 401, 'Invalid ObjectId sub claim -> 401');

      const ghostJwt = jwt.sign(
        { sub: new mongoose.Types.ObjectId().toString(), role: 'STUDENT' },
        process.env.JWT_SECRET,
        { expiresIn: 300 }
      );
      const ghostRes = await env
        .http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ghostJwt}`);
      checkEqual(ghostRes.status, 401, 'Nonexistent/deleted Student subject JWT -> 401');

      // Wrong role isolation
      const volToAdmin = await env
        .http()
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${volunteerToken}`);
      checkEqual(volToAdmin.status, 403, 'Volunteer hitting /api/admin/dashboard -> 403');

      const adminToRound = await env
        .http()
        .post('/api/rounds/allocate')
        .set('Authorization', `Bearer ${adminToken}`);
      checkEqual(adminToRound.status, 403, 'Admin hitting /api/rounds/allocate -> 403');

      // 2. CORS allowlist & Helmet security headers
      const badOriginRes = await env
        .http()
        .get('/api/health')
        .set('Origin', 'https://untrusted-attacker.example.com');
      checkEqual(badOriginRes.status, 403, 'Disallowed CORS origin -> 403');
      checkEqual(badOriginRes.body.code, 'CORS_ORIGIN_NOT_ALLOWED', 'CORS code matches');

      const goodOriginRes = await env
        .http()
        .get('/api/health')
        .set('Origin', 'https://codebuddy.vvce.ac.in');
      checkEqual(goodOriginRes.status, 200, 'Approved CORS origin -> 200');
      checkEqual(
        goodOriginRes.headers['access-control-allow-origin'],
        'https://codebuddy.vvce.ac.in',
        'Approved CORS header echoed'
      );
      checkEqual(goodOriginRes.headers['x-content-type-options'], 'nosniff', 'Helmet nosniff present');
      checkEqual(goodOriginRes.headers['x-frame-options'], 'DENY', 'Helmet x-frame-options DENY');
      checkEqual(goodOriginRes.headers['x-powered-by'], undefined, 'X-Powered-By stripped');

      // 3. Malformed JSON, Payload Too Large, and Unknown Route 404
      const malformedRes = await env
        .http()
        .post('/api/admin/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "intadmin", "password": ');
      checkEqual(malformedRes.status, 400, 'Malformed JSON body -> 400');
      checkEqual(malformedRes.body.code, 'INVALID_JSON_BODY', 'Code INVALID_JSON_BODY');

      const hugeString = 'x'.repeat(160 * 1024); // > 128kb JSON_BODY_LIMIT
      const oversizedRes = await env
        .http()
        .post('/api/admin/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ username: hugeString, password: 'abc' }));
      checkEqual(oversizedRes.status, 413, 'Oversized JSON > 128kb -> 413');
      checkEqual(oversizedRes.body.code, 'PAYLOAD_TOO_LARGE', 'Code PAYLOAD_TOO_LARGE');

      const unknownRes = await env.http().get('/api/nonexistent-phase8-route');
      checkEqual(unknownRes.status, 404, 'Unknown API route -> 404');
      checkEqual(unknownRes.body.code, 'ROUTE_NOT_FOUND', 'Code ROUTE_NOT_FOUND');

      // Ensure zero stack trace or secret exposure in error responses
      for (const errBody of [badOriginRes.body, malformedRes.body, oversizedRes.body, unknownRes.body]) {
        const s = JSON.stringify(errBody);
        check(!/"stack"/i.test(s), 'Error response must not expose stack field');
        check(!s.includes(process.env.JWT_SECRET), 'Error response must not contain JWT_SECRET');
        check(!s.includes('127.0.0.1'), 'Error response must not leak Mongo URI');
      }

      // 4. Real Rate Limiter integration via Supertest (reload Express app with tight limits)
      const { app: tightApp } = env.reloadAppWithEnv({
        API_RATE_LIMIT_MAX: '5',
        LOGIN_RATE_LIMIT_MAX: '2',
        LOGIN_IP_RATE_LIMIT_MAX: '2',
      });
      const tightReq = request(tightApp);

      // Login rate limit (max 2 requests for same IP -> 3rd returns 429)
      const rl1 = await tightReq
        .post('/api/admin/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ username: 'wrong', password: 'wrong' });
      const rl2 = await tightReq
        .post('/api/admin/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ username: 'wrong', password: 'wrong' });
      const rl3 = await tightReq
        .post('/api/admin/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ username: 'wrong', password: 'wrong' });
      checkEqual(rl1.status, 401, 'Login attempt 1 within limit -> 401');
      checkEqual(rl2.status, 401, 'Login attempt 2 within limit -> 401');
      checkEqual(rl3.status, 429, 'Login attempt 3 exceeds LOGIN_RATE_LIMIT_MAX -> 429');
      checkEqual(rl3.body.code, 'RATE_LIMIT_EXCEEDED', 'Login rate limiter returns RATE_LIMIT_EXCEEDED');

      // General /api limiter (distinct IP on non-exempt route; max 5 requests -> 6th returns 429)
      for (let i = 1; i <= 5; i += 1) {
        const r = await tightReq
          .get('/api/admin/me')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', '203.0.113.20');
        checkEqual(r.status, 200, `General API call ${i}/5 succeeds -> 200`);
      }
      const api6 = await tightReq
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Forwarded-For', '203.0.113.20');
      checkEqual(api6.status, 429, 'General API call 6/5 hits 429 RATE_LIMIT_EXCEEDED');
      checkEqual(api6.body.code, 'RATE_LIMIT_EXCEEDED', 'General API rate limit code matches');

      // Confirm /api/health remains exempt even from the rate-limited IP
      const healthExempt = await tightReq.get('/api/health').set('X-Forwarded-For', '203.0.113.20');
      checkEqual(healthExempt.status, 200, 'GET /api/health remains exempt -> 200');
    });
  } finally {
    await env.stop();
  }

  console.log('\n=== TASK 6 REAL-DB INTEGRATION TEST SUMMARY ===');
  for (const s of suiteResults) {
    console.log(` - ${s.name}: ${s.status} (${s.assertions || 0} assertions)`);
  }
  console.log(
    `TOTAL ASSERTIONS: ${passedAssertions + failedAssertions} | PASSED: ${passedAssertions} | FAILED: ${failedAssertions}`
  );
  if (failedAssertions > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Integration suite failed:', err);
  process.exit(1);
});

