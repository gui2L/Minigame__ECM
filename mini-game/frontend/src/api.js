export function createApi(baseUrl, fetchRequest = fetch) {
  const base = baseUrl.replace(/\/$/, '');
  return async function request(path, options = {}) {
    let response;
    try {
      response = await fetchRequest(`${base}${path}`, options);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('API inaccessible. Vérifiez le backend, son URL et CORS.');
    }
    if (!response.ok) {
      throw new Error(`La request a échoué (${response.status}). Les données ont été conservées.`);
    }
    if (response.status === 204) return null;
    return response.json();
  };
}

export function jsonBody(method, data) {
  return {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)};
}
