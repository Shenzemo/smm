const { GoogleGenerativeAI } = require("@google/generative-ai");

const MASTER_LIST_URL = "https://gist.githubusercontent.com/Shenzemo/7014871bbc721823ef28a5332740445f/raw/98b589c932a2598a484afa28a348a19986be043a/gistfile1.txt";
const CURRENCY_URL = "https://sarfe.erfjab.com/prices";

exports.handler = async () => {
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

// --- Start: Use this complete block in your api.js ---

// 1. Handle the Services response safely
if (!servicesResponse.ok) throw new Error("Failed to fetch SMM services list");

const servicesText = await servicesResponse.text();
if (!servicesText) {
  throw new Error("SMM services list is empty or could not be loaded.");
}
const originalServices = JSON.parse(servicesText);


// 2. Handle the Currency response safely
if (!currencyResponse.ok) throw new Error("Failed to fetch currency rates");

const currencyText = await currencyResponse.text();
if (!currencyText) {
  // If currency fails, we don't crash. We just set the rate to 0.
  console.warn("Currency data was empty. Defaulting Toman rate to 0.");
  var currencyData = []; // Use 'var' so it's accessible outside the block
} else {
  var currencyData = JSON.parse(currencyText);
}


let usdToToman = 0; // Default value
if (Array.isArray(currencyData)) {
    const usdData = currencyData.find(c => c.slug === "usd");
    if (usdData && usdData.price) {
        const usdPrice = parseFloat(usdData.price.replace(/,/g, ''));
        if (!isNaN(usdPrice)) {
            usdToToman = usdPrice / 10; // Convert from Rial to Toman
        }
    }
}
// --- End: Replacement block ---

let usdToToman = 0; // Default value
// ROBUSTNESS: The currency API structure changed. It now returns an array directly.
// We check if it's an array before trying to find the price to prevent crashes.
if (Array.isArray(currencyData)) {
    const usdData = currencyData.find(c => c.slug === "usd");
    if (usdData && usdData.price) {
        const usdPrice = parseFloat(usdData.price.replace(/,/g, ''));
        if (!isNaN(usdPrice)) {
            usdToToman = usdPrice / 10; // Convert from Rial to Toman
        }
    }
}

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






