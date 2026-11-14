import { backendConfig } from './backendConfig'

export const API_ERROR_CODES = Object.freeze({
  CONFIGURATION: 'API_CONFIGURATION_ERROR',
  REQUEST: 'API_REQUEST_ERROR',
  TOKEN: 'API_TOKEN_ERROR',
  NETWORK: 'API_NETWORK_ERROR',
  RESPONSE: 'API_RESPONSE_ERROR',
  INVALID_JSON: 'API_INVALID_JSON',
  HTTP: 'API_HTTP_ERROR',
  UNAUTHORIZED: 'API_UNAUTHORIZED',
  SERVER: 'API_SERVER_ERROR',
  ABORTED: 'API_REQUEST_ABORTED',
})

export class ApiError extends Error {
  constructor(message, code, { status = null, method = null, url = null, responseBody = null, cause = null, invalidJson = false } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.method = method
    this.url = url
    this.responseBody = responseBody
    this.invalidJson = invalidJson
  }
}

function buildRequestUrl(baseUrl, path, method) {
  if (!baseUrl) {
    throw new ApiError('The API base URL is not configured.', API_ERROR_CODES.CONFIGURATION, { method })
  }
  const normalizedPath = typeof path === 'string' ? path.trim() : ''
  const relativePath = normalizedPath.replace(/^\/+/, '')
  if (!relativePath || normalizedPath.includes('\\') || /^[a-z][a-z\d+.-]*:/i.test(relativePath) || normalizedPath.startsWith('//')) {
    throw new ApiError('The API path must be a non-empty relative path.', API_ERROR_CODES.REQUEST, { method })
  }

  try {
    const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Unsupported API URL configuration.')
    return new URL(relativePath, base).toString()
  } catch (cause) {
    throw new ApiError('The API base URL is invalid.', API_ERROR_CODES.CONFIGURATION, { method, cause })
  }
}

function responseMessage(body, status) {
  if (typeof body?.message === 'string' && body.message.trim()) return body.message
  if (typeof body?.error === 'string' && body.error.trim()) return body.error
  return `The server returned HTTP ${status}.`
}

export function createApiClient({ baseUrl = backendConfig.apiBaseUrl, getAccessToken = () => null, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  let accessTokenProvider = getAccessToken
  let unauthorizedHandler = () => {}

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase()
    const url = buildRequestUrl(baseUrl, path, method)
    const headers = new Headers(options.headers || {})
    headers.set('Accept', 'application/json')

    // Authorization is managed here so services never need to handle JWT headers.
    headers.delete('Authorization')
    let accessToken
    try {
      accessToken = await accessTokenProvider()
    } catch (cause) {
      throw new ApiError('An access token could not be obtained.', API_ERROR_CODES.TOKEN, { method, url, cause })
    }
    if (typeof accessToken === 'string' && accessToken.trim()) {
      headers.set('Authorization', `Bearer ${accessToken.trim()}`)
    }

    const init = { method, headers }
    if (options.signal) init.signal = options.signal
    if (options.body !== undefined) {
      try {
        const serializedBody = JSON.stringify(options.body)
        if (serializedBody === undefined) throw new TypeError('Request body is not JSON serializable.')
        init.body = serializedBody
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      } catch (cause) {
        throw new ApiError('The request body could not be serialized as JSON.', API_ERROR_CODES.REQUEST, { method, url, cause })
      }
    }

    let response
    try {
      response = await fetchImpl(url, init)
    } catch (cause) {
      const aborted = options.signal?.aborted || cause?.name === 'AbortError'
      throw new ApiError(
        aborted ? 'The request was cancelled.' : 'The server could not be reached.',
        aborted ? API_ERROR_CODES.ABORTED : API_ERROR_CODES.NETWORK,
        { method, url, cause },
      )
    }

    let rawBody
    try {
      rawBody = await response.text()
    } catch (cause) {
      throw new ApiError('The server response could not be read.', API_ERROR_CODES.RESPONSE, { method, url, status: response.status, cause })
    }

    let responseBody = null
    let invalidJson = false
    if (rawBody.trim()) {
      try {
        responseBody = JSON.parse(rawBody)
      } catch {
        invalidJson = true
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        try { unauthorizedHandler() } catch { /* the original HTTP error remains authoritative */ }
      }
      const code = response.status === 401
        ? API_ERROR_CODES.UNAUTHORIZED
        : response.status >= 500
          ? API_ERROR_CODES.SERVER
          : API_ERROR_CODES.HTTP
      throw new ApiError(responseMessage(responseBody, response.status), code, {
        method,
        url,
        status: response.status,
        responseBody,
        invalidJson,
      })
    }

    if (invalidJson) {
      throw new ApiError('The server returned a response that is not valid JSON.', API_ERROR_CODES.INVALID_JSON, {
        method,
        url,
        status: response.status,
      })
    }

    return responseBody
  }

  return {
    request,
    get(path, options = {}) { return request(path, { ...options, method: 'GET' }) },
    post(path, body, options = {}) { return request(path, { ...options, method: 'POST', body }) },
    put(path, body, options = {}) { return request(path, { ...options, method: 'PUT', body }) },
    patch(path, body, options = {}) { return request(path, { ...options, method: 'PATCH', body }) },
    delete(path, options = {}) { return request(path, { ...options, method: 'DELETE' }) },
    setAccessTokenProvider(provider) {
      if (typeof provider !== 'function') throw new TypeError('Access token provider must be a function.')
      accessTokenProvider = provider
    },
    setUnauthorizedHandler(handler) {
      if (typeof handler !== 'function') throw new TypeError('Unauthorized handler must be a function.')
      unauthorizedHandler = handler
    },
  }
}

// Real authentication and verified competition adapters share this transport.
// Demo services remain isolated on their local mock adapters.
export const apiClient = createApiClient()
