import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getFileContent,
    handleHeadRequest,
    isDomainAllowed,
    setCommonHeaders,
} from '../functions/file/fileTools.js';

test('isDomainAllowed accepts exact hosts and subdomains from a trimmed allowlist', () => {
    const context = {
        Referer: 'https://cdn.assets.example.com/gallery',
        securityConfig: {
            access: {
                allowedDomains: ' example.com , static.example.org ',
            },
        },
        url: new URL('https://imgbed.example.net/file/demo.png'),
    };

    assert.equal(isDomainAllowed(context), true);
});

test('isDomainAllowed rejects lookalike hosts that only regex matching would allow', () => {
    const context = {
        Referer: 'https://foo.exampleXcom/gallery',
        securityConfig: {
            access: {
                allowedDomains: 'example.com',
            },
        },
        url: new URL('https://imgbed.example.net/file/demo.png'),
    };

    assert.equal(isDomainAllowed(context), false);
});

test('setCommonHeaders varies cache behavior by referer and exposes that in Vary', () => {
    const headers = new Headers();
    const url = new URL('https://imgbed.example.net/file/demo.png');

    setCommonHeaders(headers, 'demo.png', 'image/png', 'https://imgbed.example.net/manage', url);

    assert.equal(headers.get('Cache-Control'), 'private, max-age=86400');
    assert.equal(headers.get('Vary'), 'Range, Referer');
});

test('handleHeadRequest preserves vary headers for cache correctness', () => {
    const headers = new Headers({
        'Content-Length': '123',
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="demo.png"',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=2592000',
        'Vary': 'Range, Referer',
    });

    const response = handleHeadRequest(headers);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Vary'), 'Range, Referer');
});

test('getFileContent omits bodies for GET requests', async () => {
    const originalFetch = global.fetch;
    try {
        global.fetch = async (_targetUrl, init) => {
            assert.equal(init.method, 'GET');
            assert.equal(Object.prototype.hasOwnProperty.call(init, 'body'), false);
            return new Response('ok', { status: 200 });
        };

        const response = await getFileContent({
            method: 'GET',
            headers: new Headers(),
            body: 'should-not-be-forwarded',
        }, 'https://origin.example/file');

        assert.equal(await response.text(), 'ok');
    } finally {
        global.fetch = originalFetch;
    }
});

test('getFileContent keeps bodies for non-GET requests', async () => {
    const originalFetch = global.fetch;
    try {
        global.fetch = async (_targetUrl, init) => {
            assert.equal(init.method, 'POST');
            assert.equal(init.body, 'payload');
            return new Response('created', { status: 201 });
        };

        const response = await getFileContent({
            method: 'POST',
            headers: new Headers(),
            body: 'payload',
        }, 'https://origin.example/upload');

        assert.equal(await response.text(), 'created');
    } finally {
        global.fetch = originalFetch;
    }
});
