/*!
  * Zubasoft Framework
  * Copyright 2021-2022 Zubasoft - Bernhard Zuba (https://zubasoft.at)
  */
crypto = require('crypto');
const { subtle } = require('crypto').webcrypto;
var btoa = require('btoa');
const getRandomValues = require('get-random-values')


let u_data = {
    pepperedPWD: '',
    sessionID: '',
    deviceID: '',
    nonce: '',
    idx: 0,
    tokenLogin: false,
    sso: false,
	email: '',
    '2FACode': ''
}

exports.auth = {
    async hash(message, algo) {
        if(algo === undefined) {
            algo = 'SHA-512';
        }

        return await subtle.digest(algo, (new TextEncoder().encode(message)));
    },

    async _hashPBKDF2(pwd, pepper) {
        let u_key = await subtle.importKey(
            'raw',
            pwd,
            {
                name: 'PBKDF2'
            },
            false,
            ['deriveBits']
        );

        let u_hash = await subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode(pepper),
                iterations: 157,
                hash: {
                    name: 'SHA-512'
                },
            },
            u_key,
            512
        );

        return String.fromCharCode(...new Uint8Array(u_hash));
    },

    byteArrayToString(array) {
        return Array.from(new Uint8Array(array)).map((b) => b.toString(16).padStart(2, '0')).join('');
    },

    stringToArrayBufferView(str) {
        let u_bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            u_bytes[i] = str.charCodeAt(i);
        }

        return u_bytes;
    },

    byteArrayToBase64(array) {
        let u_binary = '';
        let u_bytes = new Uint8Array(array);
        let u_len = u_bytes.byteLength;
        for (let i = 0; i < u_len; i++) {
            u_binary += String.fromCharCode(u_bytes[i]);
        }
        return btoa(u_binary);
    },

    async pepperPassword(pwd, pepper) {
        // Never ever send the real password to the server in plain text (even with HTTPS)
        // Make sure to also salt the password on server side
        let u_hashed_pwd = await this.hash(pwd + pepper);
        let u_base64_pbkdf2 = btoa(await this._hashPBKDF2(u_hashed_pwd, pepper));
        let u_hashed_base65 = await this.hash(u_base64_pbkdf2);

        u_data.pepperedPWD = this.byteArrayToString(u_hashed_base65);

        return u_data.pepperedPWD;
    },

    _getAdditionalSessionData() {
        return u_data;
    },

    setSessionID(sessid, autoLogin) {
        let u_self = this;

        return new Promise(function waitUntilTransitionEnds(resolve) {
            u_data.sessionID = sessid;

            resolve();
        });
    },

    getSessionID() {
        return u_data.sessionID;
    },

    logout() {
        this.setSessionID('');
        this.setLoginParameters('', 0);
        this.set2FACode('', false);
        u_data.tokenLogin = false;
    },

    setLoginParameters(nonce, idx, pepperedPWD) {
        u_data.nonce = nonce;
        u_data.idx = idx;

        if (pepperedPWD !== undefined && pepperedPWD !== null && pepperedPWD !== 'null') {
            u_data.pepperedPWD = pepperedPWD;
        }
    },

    _getNthStringCharacter(str, n) {
        let newstr = [];
        for (let u_i = n - 1; u_i <= str.length - 1; u_i += n) {
            newstr.push(str[u_i]);
        }
        return newstr.join('');
    },

    async _getIteratedKey(key) {
        for (let u_i = 0; u_i <= u_data.idx; u_i++) {
            if (u_i % 2 === 0) {
                key = this.byteArrayToString(await this.hash(key + u_data.nonce));
            } else {
                key = this.byteArrayToString(await this.hash(u_data.nonce + key));
            }
        }

        return key;
    },

    async getEncryptionAndChecksumKey() {
        let encKey = '',
            checksumKey = '',
            hash = u_data.pepperedPWD,
            hashHalf = '';

        if (hash.length > 0) {
            hashHalf = this.byteArrayToString(await this.hash(this._getNthStringCharacter(hash, 2)));
        }

        u_data.pepperedPWD = ''; // Remove this from memory

        encKey = await this._getIteratedKey(hashHalf);

        checksumKey = this.byteArrayToString(await this.hash(this._getNthStringCharacter(encKey, 3) + hashHalf));
        checksumKey = await this._getIteratedKey(checksumKey);

        // Remove this from memory
        u_data.nonce = '';
        u_data.idx = 0;

        return {
            enc: encKey,
            checksum: checksumKey
        };
    },

    isTokenLogin() {
        return u_data.tokenLogin;
    },

    tokenLogin(email, accessToken) {
        return new Promise(function wait(resolve) {
            network.ajax({
                url: 'system/accessToken/login',
                data: {
                    email,
                    accessToken
                },
                success: function success(json) {
                    if (json.n && json.i && json.sessionID !== undefined) {
                        this.setLoginParameters(json.n, json.i);

                        this.setSessionID(json.sessionID).then(function () {
                            u_data.tokenLogin = true;
                            resolve();
                        });
                    } else {
                        this.loadLogin();
                    }
                }
            });
        });
    },

    loadLogin() {
        this.logout();
    },

    setSSO(flag) {
        u_data.sso = flag;
    },

    isSSO() {
        return u_data.sso;
    },

    set2FACode(code, setStorage) {
        u_data["2FACode"] = code;
    },

    get2FACode() {
        return u_data["2FACode"];
    },

    getMail() {
        return u_data.email;
    },

    getDeviceID() {
        if(u_data.deviceID.length > 0) {
            return u_data.deviceID;
        }

			u_deviceID = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
				(c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
			);


		u_data.deviceID = u_deviceID;

		return u_deviceID;
    }
}