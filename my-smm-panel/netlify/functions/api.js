import { GoogleGenerativeAI } from "@google/generative-ai/google-ai";

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
    
    // BUG FIX: The original code divided the price by 10, which seems incorrect for converting from Rial to Toman. 
    // The API provides the price in Rials, so we divide by 10 to get Toman. The original code was dividing by 10 twice effectively.
    // I've removed the extra division. If the API provides Toman directly, you can remove the `/ 10` altogether.
    const usdPrice = currencyData.result.find(c => c.slug === "usd")?.price;
    const usdToToman = usdPrice ? parseFloat(usdPrice.replace(/,/g, '')) / 10 : 0; // Corrected conversion

    // IMPROVEMENT: Slicing the services list to 75 means you only ever translate the first 75.
    // This might be intentional for performance, but it's important to be aware of.
    // If you need all services translated, remove the `.slice(0, 75)`.
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
    
    let translatedServices;
    // ROBUSTNESS: The AI model might not always return perfect JSON. 
    // This `try...catch` block prevents the entire function from crashing if the AI response is malformed.
    try {
      translatedServices = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", responseText);
      throw new Error("AI response was not valid JSON.");
    }

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
