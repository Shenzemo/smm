import { GoogleGenerativeAI } from "@google-generative-ai/google-ai";

const MASTER_LIST_URL = "https://gist.githubusercontent.com/Shenzemo/7014871bbc721823ef28a5332740445f/raw/98b589c932a2598a484afa28a348a19986be043a/gistfile.txt";
const CURRENCY_URL = "https://sarfe.erfjab.com/prices";

export const handler = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not configured." }) };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const [servicesResponse, currencyResponse] = await Promise.all([
      fetch(MASTER_LIST_URL),
      fetch(CURRENCY_URL),
    ]);

    if (!servicesResponse.ok) throw new Error("Failed to fetch SMM services list");
    const originalServices = await servicesResponse.json();

    if (!currencyResponse.ok) throw new Error("Failed to fetch currency rates");
    const currencyData = await currencyResponse.json();
    
    const usdPrice = currencyData.result.find(c => c.slug === "usd")?.price;
    const usdToToman = usdPrice ? parseFloat(usdPrice.replace(/,/g, '')) / 10 : 0;

    const servicesToTranslate = originalServices.slice(0, 75).map(s => ({
      id: s.service,
      product_name: s.product_name,
      category: s.category
    }));

    const prompt = `
      Translate the following list of social media marketing services into natural-sounding Persian.
      Provide the response ONLY as a valid JSON object, where keys are the original service 'id' as a string, and values are objects containing the translated 'product_name' and 'category'.
      Do not include any other text, explanations, or markdown formatting like \`\`\`json. Just the raw JSON object.

      Example: {"2": { "product_name": "...", "category": "..." }, "3": { "product_name": "...", "category": "..." }}

      Translate this list:
      ${JSON.stringify(servicesToTranslate)}
    `;
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const translatedServices = JSON.parse(responseText);

    return {
      statusCode: 200,
      body: JSON.stringify({
        originalServices,
        translatedServices,
        usdToTomanRate: usdToToman
      }),
    };

  } catch (error) {
    console.error("Error in serverless function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
