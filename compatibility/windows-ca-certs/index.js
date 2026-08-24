'use strict';

const tls = require('node:tls');

function pemToDer(pem) {
    const base64 = pem
        .replace('-----BEGIN CERTIFICATE-----', '')
        .replace('-----END CERTIFICATE-----', '')
        .replace(/\s+/g, '');
    return Buffer.from(base64, 'base64');
}

class Crypt32 {
    constructor() {
        const certificates = typeof tls.getCACertificates === 'function'
            ? tls.getCACertificates('system')
            : tls.rootCertificates;
        this.certificates = certificates.map(pemToDer);
        this.index = 0;
    }

    next() {
        if (this.index >= this.certificates.length) {
            return undefined;
        }
        const certificate = this.certificates[this.index];
        this.index += 1;
        return certificate;
    }

    done() {
        this.certificates = [];
        this.index = 0;
    }
}

module.exports = { Crypt32 };
