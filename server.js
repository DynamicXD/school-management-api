require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.MYSQL_PORT || 3000;

app.use(bodyParser.json());

const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    database: process.env.MYSQL_DB_NAME,
    user: process.env.MYSQL_DB_USER,
    password: process.env.MYSQL_DB_PASSWORD,
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('MySQL connected...');
});

app.get('/', (req, res) => {
    const endpoints = [
        {
            endpoint: '/addSchool',
            method: 'POST',
            description: 'Add a new school to the database.',
            payload: {
                name: 'string (required)',
                address: 'string (required)',
                latitude: 'number (required, between -90 and 90)',
                longitude: 'number (required, between -180 and 180)'
            },
            response: 'Returns the added school data.'
        },
        {
            endpoint: '/listSchools',
            method: 'GET',
            description: 'Fetch all schools sorted by proximity to the user\'s location.',
            parameters: {
                latitude: 'number (required, between -90 and 90)',
                longitude: 'number (required, between -180 and 180)'
            },
            response: 'Returns a sorted list of schools with distances.'
        }
    ];

    let htmlResponse = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>School API Documentation</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                }
                h1 {
                    color: #333;
                }
                .endpoint {
                    margin-bottom: 20px;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    background-color: #f9f9f9;
                }
                .endpoint h2 {
                    margin: 0;
                    color: #555;
                }
                .endpoint p {
                    margin: 5px 0;
                }
                .endpoint ul {
                    margin: 5px 0;
                    padding-left: 20px;
                }
            </style>
        </head>
        <body>
            <h1>Welcome to the School Management API!</h1>
            <p>Below is a list of available endpoints:</p>
    `;

    endpoints.forEach((endpoint) => {
        htmlResponse += `
            <div class="endpoint">
                <h2>${endpoint.method} ${endpoint.endpoint}</h2>
                <p><strong>Description:</strong> ${endpoint.description}</p>
                ${endpoint.payload ? `
                    <p><strong>Payload:</strong></p>
                    <ul>
                        ${Object.entries(endpoint.payload).map(([key, value]) => `
                            <li><strong>${key}:</strong> ${value}</li>
                        `).join('')}
                    </ul>
                ` : ''}
                ${endpoint.parameters ? `
                    <p><strong>Parameters:</strong></p>
                    <ul>
                        ${Object.entries(endpoint.parameters).map(([key, value]) => `
                            <li><strong>${key}:</strong> ${value}</li>
                        `).join('')}
                    </ul>
                ` : ''}
                <p><strong>Response:</strong> ${endpoint.response}</p>
            </div>
        `;
    });

    htmlResponse += `
        </body>
        </html>
    `;

    res.status(200).send(htmlResponse);
});

app.post('/addSchool', (req, res) => {
    const { name, address, latitude, longitude } = req.body;

    if (!name || !address || latitude === undefined || longitude === undefined) {
        return res.status(400).send({ status: 400, message: 'Invalid request. Missing required fields.' });
    }

    if (typeof name !== 'string' || typeof address !== 'string') {
        return res.status(400).send({ status: 400, message: 'Invalid request. Name and Address must be strings.' });
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).send({ status: 400, message: 'Invalid request. Latitude and Longitude must be numbers.' });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).send({ status: 400, message: 'Invalid request. Latitude must be between -90 and 90, and Longitude must be between -180 and 180.' });
    }

    const schoolData = { name, address, latitude, longitude };

    const sql = 'INSERT INTO schools SET ?';
    db.query(sql, schoolData, (err, result) => {
        if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).send({ status: 500, message: 'Internal server error. Failed to add school.' });
        }
        res.status(201).send({ status: 201, message: 'School added successfully!', data: result });
    });
});

app.get('/listSchools', (req, res) => {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
        return res.status(400).send({ status: 400, message: 'Invalid request. Latitude and Longitude are required.' });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    if (isNaN(userLat) || isNaN(userLon)) {
        return res.status(400).send({ status: 400, message: 'Invalid request. Latitude and Longitude must be numbers.' });
    }

    if (userLat < -90 || userLat > 90 || userLon < -180 || userLon > 180) {
        return res.status(400).send({ status: 400, message: 'Invalid request. Latitude must be between -90 and 90, and Longitude must be between -180 and 180.' });
    }

    const sql = 'SELECT * FROM schools';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching schools:', err);
            return res.status(500).send({ status: 500, message: 'Internal server error. Failed to fetch schools.' });
        }

        const schoolsWithDistance = results.map(school => {
            const schoolLat = school.latitude;
            const schoolLon = school.longitude;

            const distance = calculateDistance(userLat, userLon, schoolLat, schoolLon);
            return { ...school, distance };
        });

        schoolsWithDistance.sort((a, b) => a.distance - b.distance);

        res.status(200).send({ status: 200, message: 'Schools fetched successfully!', data: schoolsWithDistance });
    });
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const R = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});