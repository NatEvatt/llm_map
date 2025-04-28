export class ApiCalls {
  static getAPIUrl() {
    const apiUrl = process.env.BACKEND_URL;
    return apiUrl;
  }

  static async fetchNLQueryIds(nlQuery: string) {
    const urlSafeMessage = encodeURIComponent(nlQuery);
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(`${apiUrl}/query?nl_query=${urlSafeMessage}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    return response.json();
  }

  static async fetchGeoJson(layerName: string) {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(
      `${apiUrl}/get-layer-geojson?layer=${layerName}`,
    );
    return await response.json();
  }

  static async getLayerPopupProperties(layerId: string, parkId: number) {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(
      `${apiUrl}/get-layer-popup-properties?layer=${layerId}&park_id=${parkId}`,
    );
    return await response.json();
  }

  static async saveQuery(
    nlQuery: string,
    sqlQuery: string,
    primaryLayer: string,
  ) {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(
      `${apiUrl}/save-query?nl_query=${encodeURIComponent(nlQuery)}&sql_query=${encodeURIComponent(sqlQuery)}&primary_layer=${encodeURIComponent(primaryLayer)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
    return await response.json();
  }

  static async getSavedQueries(): Promise<
    Array<{ id: number; nl_query: string; timestamp: string }>
  > {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(`${apiUrl}/get-saved-queries`);
    if (!response.ok) {
      throw new Error('Failed to fetch saved queries');
    }
    return response.json();
  }

  static async deleteSavedQuery(id: number): Promise<void> {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(`${apiUrl}/delete-saved-query/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete saved query');
    }
  }

  static async loadSavedQuery(id: number) {
    const apiUrl = ApiCalls.getAPIUrl();
    const response = await fetch(`${apiUrl}/load-saved-query/${id}`);
    if (!response.ok) {
      throw new Error('Failed to load saved query');
    }
    return response.json();
  }
}
