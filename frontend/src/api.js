const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the API. Check that the backend is running, then try again.');
  }

  let data;
  try { 
    data = await response.json(); 
  } catch {
    throw new Error('The API returned an unreadable response. Check the backend and proxy settings.');
  }
  
  if (!response.ok) {
    const error = new Error(data.error?.message || 'The request could not be completed.');
    error.code = data.error?.code;
    error.sqlNumber = data.error?.number;
    error.status = response.status;
    throw error;
  }
  return data;
}