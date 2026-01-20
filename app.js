// Step 1: Fetch available routes from Google Maps with traffic data

const googleMapsApiKey="AIzaSyB30-FnWxLWlkY0TlfumEB3YhwX-XZBWeM"
const openaiApiKey="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"

async function getAvailableRoutes(origin, destination) {
  const originStr = `${origin.latitude},${origin.longitude}`;
  const destinationStr = `${destination.latitude},${destination.longitude}`;
  
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&alternatives=true&departure_time=now&traffic_model=best_guess&key=${googleMapsApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API Error: ${data.status}`);
    }
    
    // Parse and structure the routes
    const routes = data.routes.map((route, index) => ({
      routeId: index + 1,
      summary: route.summary,
      distance: route.legs[0].distance.text,
      distanceValue: route.legs[0].distance.value, // in meters
      distanceKm: (route.legs[0].distance.value / 1000).toFixed(2),
      duration: route.legs[0].duration.text,
      durationValue: route.legs[0].duration.value, // in seconds
      durationInTraffic: route.legs[0].duration_in_traffic?.text || route.legs[0].duration.text,
      durationInTrafficValue: route.legs[0].duration_in_traffic?.value || route.legs[0].duration.value,
      steps: route.legs[0].steps.length,
      warnings: route.warnings,
      startAddress: route.legs[0].start_address,
      endAddress: route.legs[0].end_address
    }));
    
    return routes;
    
  } catch (error) {
    console.error('Error fetching routes:', error);
    throw error;
  }
}

// Step 2: Analyze routes and calculate traffic impact
function analyzeRoutes(routes) {
  return routes.map(route => {
    const trafficDelaySeconds = route.durationInTrafficValue - route.durationValue;
    const trafficDelayMinutes = Math.round(trafficDelaySeconds / 60);
    const trafficPercentage = ((trafficDelaySeconds / route.durationValue) * 100).toFixed(1);
    
    // Determine traffic severity
    let trafficLevel = 'low';
    if (trafficPercentage > 20) trafficLevel = 'high';
    else if (trafficPercentage > 10) trafficLevel = 'moderate';
    
    return {
      ...route,
      trafficDelay: trafficDelaySeconds,
      trafficDelayMinutes: trafficDelayMinutes,
      trafficPercentage: parseFloat(trafficPercentage),
      trafficLevel: trafficLevel
    };
  });
}



// Step 3: Use AI to recommend the best route based on traffic and other factors
async function recommendBestRoute(routes, origin, destination) {
  // Analyze routes with traffic data
  const analyzedRoutes = analyzeRoutes(routes);
  
  // Prepare detailed prompt for AI
  const prompt = `You are an expert traffic and route optimization AI. Analyze these routes and recommend the BEST one for a delivery.

TRIP DETAILS:
- From: ${origin.name || 'Origin'} (${origin.latitude}, ${origin.longitude})
- To: ${destination.name || 'Destination'} (${destination.latitude}, ${destination.longitude})

AVAILABLE ROUTES:
${analyzedRoutes.map(route => `
━━━━━━━━━━━━━━━━━━━━━━━━━━
Route ${route.routeId}: ${route.summary}
- Distance: ${route.distance} (${route.distanceKm} km)
- Normal Time: ${route.duration}
- Current Traffic Time: ${route.durationInTraffic}
- Traffic Delay: +${route.trafficDelayMinutes} minutes (${route.trafficPercentage}% slower)
- Traffic Level: ${route.trafficLevel.toUpperCase()}
- Route Complexity: ${route.steps} steps/turns
- Warnings: ${route.warnings.length > 0 ? route.warnings.join(', ') : 'None'}
`).join('\n')}

DECISION CRITERIA (in order of importance):
1. Minimize total delivery time with current traffic
2. Balance speed vs distance efficiency
3. Consider route complexity (fewer turns = easier navigation)
4. Avoid routes with warnings when possible
5. Factor in traffic unpredictability

Analyze each route and respond in JSON format ONLY:
{
  "recommendedRouteId": <number>,
  "reasoning": "<2-3 sentences explaining why this is best>",
  "pros": ["<advantage 1>", "<advantage 2>"],
  "cons": ["<potential downside>"],
  "alternativeRouteId": <number or null>,
  "alternativeReason": "<why consider the alternative>",
  "overallTrafficImpact": "<low|moderate|high>",
  "recommendedDepartureAdvice": "<best time to leave or traffic insight>"
}`;

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
            content: 'You are an expert logistics and traffic optimization AI that analyzes route data and traffic patterns to recommend the most efficient delivery routes.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const aiRecommendation = JSON.parse(data.choices[0].message.content);
    
    // Get the recommended route details
    const recommendedRoute = analyzedRoutes.find(
      r => r.routeId === aiRecommendation.recommendedRouteId
    );
    
    const alternativeRoute = aiRecommendation.alternativeRouteId 
      ? analyzedRoutes.find(r => r.routeId === aiRecommendation.alternativeRouteId)
      : null;
    
    return {
      recommended: {
        routeId: recommendedRoute.routeId,
        summary: recommendedRoute.summary,
        distance: recommendedRoute.distance,
        duration: recommendedRoute.durationInTraffic,
        trafficDelay: `${recommendedRoute.trafficDelayMinutes} min`,
        trafficLevel: recommendedRoute.trafficLevel,
        steps: recommendedRoute.steps
      },
      alternative: alternativeRoute ? {
        routeId: alternativeRoute.routeId,
        summary: alternativeRoute.summary,
        distance: alternativeRoute.distance,
        duration: alternativeRoute.durationInTraffic,
        trafficDelay: `${alternativeRoute.trafficDelayMinutes} min`,
        trafficLevel: alternativeRoute.trafficLevel
      } : null,
      aiAnalysis: {
        reasoning: aiRecommendation.reasoning,
        pros: aiRecommendation.pros,
        cons: aiRecommendation.cons,
        alternativeReason: aiRecommendation.alternativeReason,
        overallTrafficImpact: aiRecommendation.overallTrafficImpact,
        departureAdvice: aiRecommendation.recommendedDepartureAdvice
      },
      allRoutes: analyzedRoutes
    };
    
  } catch (error) {
    console.error('Error calling AI for route recommendation:', error);
    throw error;
  }
}



// Step 4: Main function - Get AI-powered route recommendation
async function getRouteRecommendation(origin, destination) {
  console.log('🗺️  Fetching available routes from Google Maps...');
  
  // Fetch all available routes with traffic data
  const routes = await getAvailableRoutes(origin, destination, googleMapsApiKey);
  
  console.log(`📍 Found ${routes.length} available route(s)`);
  
  // Use AI to analyze and recommend the best route
  console.log('🤖 AI analyzing routes with traffic data...');
  const recommendation = await recommendBestRoute(routes, origin, destination, openaiApiKey);
  
  console.log('✅ Route recommendation complete!');
  
  return recommendation;
}

// // ==================== EXAMPLE USAGE ====================

// const origin = {
//   name: 'Westlands Mall, Nairobi',
//   latitude: -1.2635,
//   longitude: 36.8038
// };

// const destination = {
//   name: 'Yaya Centre, Kilimani',
//   latitude: -1.2952,
//   longitude: 36.7879
// };

//  getRouteRecommendation(
//   origin, 
//   destination
// )
// .then(result => {
//   console.log('\n🎯 RECOMMENDED ROUTE:');
//   console.log(result.recommended);
  
//   console.log('\n💡 AI ANALYSIS:');
//   console.log(result.aiAnalysis);
  
//   if (result.alternative) {
//     console.log('\n🔄 ALTERNATIVE ROUTE:');
//     console.log(result.alternative);
//   }
  
//   console.log('\n📊 ALL ROUTES:');
//   console.log(result.allRoutes);
// })