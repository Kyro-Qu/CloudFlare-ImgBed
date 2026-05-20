/* File read helpers */

function normalizeHostname(hostname) {
    return typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';
}

function matchesAllowedDomain(hostname, allowedDomain) {
    const normalizedHost = normalizeHostname(hostname);
    const normalizedAllowed = normalizeHostname(allowedDomain);

    if (!normalizedHost || !normalizedAllowed) {
        return false;
    }

    return normalizedHost === normalizedAllowed || normalizedHost.endsWith(`.${normalizedAllowed}`);
}

// Check whether the request referer is in the allowlist.
export function isDomainAllowed(context) {
    const { Referer, securityConfig, url } = context;

    const allowedDomains = securityConfig.access.allowedDomains;

    if (Referer) {
        try {
            const refererUrl = new URL(Referer);
            if (allowedDomains && allowedDomains.trim() !== '') {
                const domains = allowedDomains
                    .split(',')
                    .map(domain => normalizeHostname(domain))
                    .filter(Boolean);
                domains.push(normalizeHostname(url.hostname));

                const isAllowed = domains.some(domain => matchesAllowedDomain(refererUrl.hostname, domain));

                if (!isAllowed) {
                    return false;
                }
            }
        } catch (e) {
            return false;
        }
    }

    return true;
}

// Set shared response headers for file responses.
export function setCommonHeaders(headers, encodedFileName, fileType, Referer, url) {
    headers.set('Content-Disposition', `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Vary', 'Range, Referer');

    if (fileType) {
        headers.set('Content-Type', fileType);
    }

    if (Referer && Referer.includes(url.origin)) {
        headers.set('Cache-Control', 'private, max-age=86400');
    } else {
        headers.set('Cache-Control', 'public, max-age=2592000');
    }
}

// Set range-related response headers.
export function setRangeHeaders(headers, rangeStart, rangeEnd, totalSize) {
    const contentLength = rangeEnd - rangeStart + 1;
    headers.set('Content-Length', contentLength.toString());
    headers.set('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${totalSize}`);
}

// Build a HEAD response while preserving the relevant headers.
export function handleHeadRequest(headers, etag = null) {
    const responseHeaders = new Headers();

    responseHeaders.set('Content-Length', headers.get('Content-Length') || '0');
    responseHeaders.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
    responseHeaders.set('Content-Disposition', headers.get('Content-Disposition') || 'inline');
    responseHeaders.set('Access-Control-Allow-Origin', headers.get('Access-Control-Allow-Origin') || '*');
    responseHeaders.set('Accept-Ranges', headers.get('Accept-Ranges') || 'bytes');
    responseHeaders.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=2592000');
    responseHeaders.set('Vary', headers.get('Vary') || 'Range, Referer');

    if (etag) {
        responseHeaders.set('ETag', etag);
    }

    return new Response(null, {
        status: 200,
        headers: responseHeaders,
    });
}

export async function getFileContent(request, targetUrl, max_retries = 2) {
    let retries = 0;
    while (retries <= max_retries) {
        try {
            const init = {
                method: request.method,
                headers: request.headers,
            };

            if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null) {
                init.body = request.body;
            }

            const response = await fetch(targetUrl, init);
            if (response.ok || response.status === 304) {
                return response;
            } else if (response.status === 404) {
                return new Response('Error: Image Not Found', { status: 404 });
            } else {
                retries++;
            }
        } catch (error) {
            retries++;
        }
    }
    return null;
}

export function isTgChannel(imgRecord) {
    return imgRecord.metadata?.Channel === 'Telegram' || imgRecord.metadata?.Channel === 'TelegramNew';
}

// Check whether a file is allowed to be returned.
export async function returnWithCheck(context, imgRecord) {
    const { request, env, url, securityConfig } = context;
    const whiteListMode = securityConfig.access.whiteListMode;

    const response = new Response('success', { status: 200 });

    if (request.headers.get('Referer') && request.headers.get('Referer').includes(url.origin)) {
        return response;
    }

    const record = imgRecord;
    if (record.metadata === null) {
    } else {
        if (record.metadata.ListType == "White") {
            return response;
        } else if (record.metadata.ListType == "Block") {
            return await returnBlockImg(url);
        } else if (record.metadata.Label == "adult") {
            return await returnBlockImg(url);
        }

        if (whiteListMode) {
            return await returnWhiteListImg(url);
        } else {
            return response;
        }
    }

    return response;
}

export async function return404(url) {
    const Img404 = await fetch(url.origin + "/static/404.png");
    if (!Img404.ok) {
        return new Response('Error: Image Not Found',
            {
                status: 404,
                headers: {
                    "Cache-Control": "public, max-age=86400"
                }
            }
        );
    } else {
        return new Response(Img404.body, {
            status: 404,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}

export async function returnBlockImg(url) {
    const blockImg = await fetch(url.origin + "/static/BlockImg.png");
    if (!blockImg.ok) {
        return new Response(null, {
            status: 302,
            headers: {
                "Location": url.origin + "/blockimg",
                "Cache-Control": "public, max-age=86400"
            }
        });
    } else {
        return new Response(blockImg.body, {
            status: 403,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}

export async function returnWhiteListImg(url) {
    const WhiteListImg = await fetch(url.origin + "/static/WhiteListOn.png");
    if (!WhiteListImg.ok) {
        return new Response(null, {
            status: 302,
            headers: {
                "Location": url.origin + "/whiteliston",
                "Cache-Control": "public, max-age=86400"
            }
        });
    } else {
        return new Response(WhiteListImg.body, {
            status: 403,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}
