const { sqlConfig } = require("../config/index")
const dotenv = require("dotenv")
const path = require("path")
const mssql = require("mssql")

dotenv.config({ path: path.resolve(__dirname, '../.env') })


const openaiApiKey = process.env.OPENAI_API_KEY

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat = toRadians(lat2 - lat1)
    const dLon = toRadians(lon2 - lon1)

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    return distance;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function prepareRiderData(riders, merchant) {
    return riders.map(rider => ({
        id: rider.Id,
        latitude: rider.latitude,
        longitude: rider.longitude,
        distanceKm: calculateDistance(
            merchant.latitude,
            merchant.longitude,
            rider.latitude,
            rider.longitude
        )
    }));
}

async function selectRiderWithAI(riders, merchant) {
    const ridersWithDistance = prepareRiderData(riders, merchant);


    // Sort riders by distance for better context
    const sortedRiders = ridersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);



    // Prepare prompt for ChatGPT
    const prompt = `You are a logistics optimization AI. Given the following merchant location and available riders, select the most suitable rider for pickup.

Merchant Location:
- ID: ${merchant.id}
- Latitude: ${merchant.latitude}
- Longitude: ${merchant.longitude}

Available Riders:
${sortedRiders.map(r =>
        `- Rider ID: ${r.id}, Distance: ${r.distanceKm.toFixed(2)} km`
    ).join('\n')}

Select the best rider based on proximity. Respond with ONLY the rider ID as a number, nothing else.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini-2024-07-18',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a logistics AI assistant that selects the optimal rider for deliveries.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 10
            })
        });

        const data = await response.json();

        const selectedRiderId = parseInt(data.choices[0].message.content.trim());

        console.log(selectedRiderId);

        // Find the selected rider from original riders array
        const selectedRider = riders.find(r => r.Id === selectedRiderId);
        // Return only id and name
        return {
            id: selectedRider.Id,
            name: selectedRider.Name
        };

    } catch (error) {
        console.error('Error calling ChatGPT:', error);
        throw error;
    }
}





async function assignRider(merchant, riders) {
    const result = await selectRiderWithAI(riders, merchant);
    return result;
}



async function getActiveAvailableRiders() {
    const pool = await mssql.connect(sqlConfig);

    const result = await pool.request()
        .query(`
            SELECT Id,Name,latitude,longitude 
            FROM Riders
            WHERE isactive = 1
              AND RiderState = 0
        `);

    return result.recordset;
}


async function riderMerchantController(req, res) {
    try {
        const { merchantId } = req.body

        const pool = await mssql.connect(sqlConfig);

        const merchantResult = await pool.request()
            .input('merchantId', mssql.Int, 12)
            .query(`
        SELECT Id, latitude, longitude
        FROM Merchants
        WHERE Id = ${merchantId}
    `)


        const merchants = merchantResult.recordset[0]



        const riders = await getActiveAvailableRiders()

        const results = await assignRider(merchants, riders)

        return res.status(200).json({ results })


    } catch (error) {
        return res.status(500).json(error)
    }
}

module.exports = {
    riderMerchantController
}