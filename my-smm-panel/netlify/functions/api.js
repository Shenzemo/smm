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
    // 1. Fetch both URLs at the same time
    const [servicesResponse, currencyResponse] = await Promise.all([
      fetch(MASTER_LIST_URL),
      fetch(CURRENCY_URL),
    ]);

    // 2. Robustly handle the Services response
    if (!servicesResponse.ok) {
        throw new Error(`Failed to fetch SMM services list. Status: ${servicesResponse.status}`);
    }
    const servicesText = await servicesResponse.text();
    if (!servicesText) {
      throw new Error("SMM services list is empty or could not be loaded.");
    }
    const originalServices = JSON.parse(servicesText);

    // 3. Robustly handle the Currency response
    let usdToToman = 0; // Default value
    if (currencyResponse.ok) {
        const currencyText = await currencyResponse.text();
        if (currencyText) {
            const currencyData = JSON.parse(currencyText);
            if (Array.isArray(currencyData)) {
                const usdData = currencyData.find(c => c.slug === "usd");
                if (usdData && usdData.price) {
                    const usdPrice = parseFloat(usdData.price.replace(/,/g, ''));
                    if (!isNaN(usdPrice)) {
                        usdToToman = usdPrice / 10; // Convert from Rial to Toman
                    }
                }
            }
        } else {
            console.warn("Currency data was empty. Defaulting Toman rate to 0.");
        }
    } else {
        console.warn(`Failed to fetch currency rates. Status: ${currencyResponse.status}. Defaulting Toman rate to 0.`);
    }

    // 4. Translate the services
    const servicesToTranslate = originalServices.slice(0, 75).map(s => ({
      id: s.service,
      product_name: s.product_name,
      category: s.category
    }));

    const prompt = `
      Translate the following list of social media marketing services into natural-sounding Persian.
      Provide the response ONLY as a valid JSON object, where keys are the original service 'id' as a string, and values are objects containing the translated 'product_name' and 'category'.
      Do not include any other text, explanations, or markdown formatting like \`\`\`json. Just the raw JSON object.
      Example: {"2": { "product_name": "...", "category": "..." }}
      Translate this list:
      ${JSON.stringify(servicesToTranslate)}
    `;
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    let translatedServices;
    try {
      // ** THE FIX IS HERE **
      // Clean the AI response to remove Markdown formatting before parsing.
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      translatedServices = JSON.parse(cleanedText);
    } catch (parseError) {
      // Log the original, unclean text for better debugging if it fails again.
      console.error("Failed to parse AI response as JSON:", responseText);
      throw new Error("AI response was not valid JSON.");
    }

    // 5. Return the final data
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


