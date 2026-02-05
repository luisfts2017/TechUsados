export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Permite apenas GET
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      // ID da planilha pode vir por query ?sheetId=...
      const sheetId = url.searchParams.get("sheetId") || env.SHEET_ID;

      if (!sheetId) {
        return new Response("Missing sheetId", { status: 400 });
      }

      const range = "A2:I1000";
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${env.GOOGLE_API_KEY}`;

      const response = await fetch(sheetsUrl);

      if (!response.ok) {
        return new Response("Error fetching Google Sheets", { status: response.status });
      }

      const data = await response.text();

      return new Response(data, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30"
        }
      });
    } catch (err) {
      return new Response("Internal error", { status: 500 });
    }
  }
};
