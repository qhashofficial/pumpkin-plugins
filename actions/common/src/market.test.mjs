import assert from 'node:assert/strict';
import * as http from 'node:http';
import { describe, it } from 'node:test';
import { findListingById, findListingByName, marketUrl } from './market.mjs';

function server(handler) {
    return new Promise((resolve) => {
        const instance = http.createServer(handler).listen(0, '127.0.0.1', () => {
            const address = instance.address();
            resolve({ instance, url: `http://127.0.0.1:${address.port}` });
        });
    });
}

function json(response, value) {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
}

describe('shared Market API helpers', () => {
    it('defaults to the public Market and trims trailing slashes', () => {
        assert.equal(marketUrl(''), 'https://market.pumpkinmc.org');
        assert.equal(marketUrl('https://market.example.test//'), 'https://market.example.test');
    });

    it('accepts plain HTTP only for a loopback test server', () => {
        assert.equal(marketUrl('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
        assert.equal(marketUrl('http://localhost:8080'), 'http://localhost:8080');
        assert.throws(() => marketUrl('http://market.example.test'), /api-url must use https/);
        assert.throws(() => marketUrl('not a url'), /api-url must be an absolute URL/);
    });

    it('treats a missing ID as absent and rejects a malformed listing', async () => {
        const market = await server((request, response) => {
            if (request.url.endsWith('/missing')) {
                response.statusCode = 404;
                response.end('not found');
            } else json(response, { id: 'not-a-number', name: 'Listing', version: null });
        });
        try {
            assert.equal(await findListingById(market.url, 'missing'), undefined);
            await assert.rejects(findListingById(market.url, 'broken'), /not a valid listing/);
        } finally {
            market.instance.close();
        }
    });

    it('rejects an exact name match whose listing data is malformed', async () => {
        const market = await server((_request, response) => json(response, [{ id: 7, name: 'Listing', version: 3 }]));
        try {
            await assert.rejects(findListingByName(market.url, 'listing'), /not a valid listing/);
        } finally {
            market.instance.close();
        }
    });
});
