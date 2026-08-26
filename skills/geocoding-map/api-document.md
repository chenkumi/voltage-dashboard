Example API Requests
Reverse Geocoding: (Convert coordinates to address)
https://geocode.maps.co/reverse?lat=latitude&lon=longitude&api_key=YOUR_SECRET_API_KEY
Forward Geocoding: (Search or convert address to coordinates)
https://geocode.maps.co/search?q=address&api_key=YOUR_SECRET_API_KEY
You may also send the API key using the following HTTP header: "Authorization: Bearer YOUR_SECRET_API_KEY".

Replace {address}, {latitude} and {longitude} with the values to geocode. You will also need to replace {YOUR_SECRET_API_KEY} with your API key. If you do not have an API key, please create a free account to obtain an API key. NOTE: Our API endpoints return JSON data by default. For different formats, append "&format={format}", where {format} is one of the following: xml, json, jsonv2, geojson, geocodejson.


Our API supports both forward (address to coordinates) and reverse (coordinates to address) geocoding.

This document describes how to send basic geocoding requests to the API. When making requests, be sure to replace YOUR_SECRET_API_KEY with your actual API key.

Please also see the API Endpoint Reference for advanced API usage.

How Do I Use This Geocoding API?
Reverse Geocoding (convert coordinates to an address or place):

Send a request to the /reverse endpoint with both lat and lon parameters:

https://geocode.maps.co/reverse?lat=40.7558017&lon=-73.9787414&api_key=YOUR_SECRET_API_KEY
Forward Geocoding (convert an address to coordinates):

To perform a free-form address search, pass the address as the q parameter to the /search endpoint:

https://geocode.maps.co/search?q=555+5th+Ave+New+York+NY+10017+US&api_key=YOUR_SECRET_API_KEY
Example search by name:

https://geocode.maps.co/search?q=Statue+of+Liberty+NY+US&api_key=YOUR_SECRET_API_KEY
You can also use structured search parameters instead of a free-form query:

street=<housenumber> <streetname>
city=<city>
county=<county>
state=<state>
country=<country>
postalcode=<postalcode>
Example structured query:

https://geocode.maps.co/search?street=555+5th+Ave&city=New+York&state=NY&postalcode=10017&country=US&api_key=YOUR_SECRET_API_KEY
For a complete list of parameters, see the API Endpoint Reference.

Note: API responses are returned in JSON format by default. To request another format, append &format={format} — valid values include xml, json, jsonv2, geojson, and geocodejson.

You may also send your API key in an HTTP header: Authorization: Bearer YOUR_SECRET_API_KEY.

API Limitations and Rate Throttling
For higher request volumes, please create an account to upgrade your plan.

If your application exceeds the rate limit for your current plan, requests will return an HTTP 429 status. Upon receiving this response, you should reduce your request rate — for example, by adding a one-second delay between requests.

Requests that return HTTP 429 will not include geocoding results and should be retried later.

During periods of exceptionally high server load, the API may return HTTP 503 to temporarily refuse requests.

Clients that continuously ignore rate limits or generate excessive, repetitive, or resource-intensive requests may be blocked. Blocked clients receive an HTTP 403 response. If this occurs, please contact us using the email provided above so we can help resolve the issue.

Rate limits and usage policies may change as needed to maintain system stability. Any updates will be reflected in this documentation.

Check API Key Usage:

https://geocode.maps.co/api/key_usage?api_key=YOUR_SECRET_API_KEY
Troubleshooting: No Results Returned
If a query returns no results, it means that OpenStreetMap (OSM) or Nominatim could not find a match for the provided input.

Because this API is based entirely on OSM data, the completeness and accuracy of results depend on community contributions. For broader or more commercial coverage, you may wish to consider paid geocoding providers such as Esri or Google.

About the Data
This service uses OpenStreetMap data and the Nominatim geocoding engine to provide open geolocation results.

See the API Endpoint Reference for detailed parameter lists and response formats.