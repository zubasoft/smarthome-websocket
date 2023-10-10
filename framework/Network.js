/*!
  * Zubasoft Framework
  * Copyright 2021-2023 Zubasoft - Bernhard Zuba (https://zubasoft.at)
  */

const auth = require('./Auth.js').auth;
const fetch = require('node-fetch');
crypto = require('crypto');
const { subtle } = require('crypto').webcrypto;

require('dotenv').config();

exports.network = {
    data: {
        encKey: '',
        iv: '',
        checksumkey: '',
        calculateOnce: false
    },

    async _calculateEncryptionAndChecksumKey() {
        if(this.data.calculateOnce === false) {
            this.data.calculateOnce = auth.getEncryptionAndChecksumKey();
            let keys = await this.data.calculateOnce;
            this.data.encKey = keys.enc.substring(0, 32);
            this.data.iv = keys.enc.slice(-16);
            this.data.checksumkey = keys.checksum;
        } else {
            await this.data.calculateOnce;
        }
    },

    async _resetEncryptionAndChecksumKey() {
        this.data.encKey = '';
        this.data.iv = '';
        this.data.checksumkey = '';
        this.data.calculateOnce = false;
        auth.set2FACode('', false);
    },

    async _encrypt(data) {
        if(this.data.encKey.length > 0) {
            let u_key = await subtle.importKey(
                'raw',
                (new TextEncoder().encode(this.data.encKey)),
                'AES-CBC',
                true,
                ['encrypt', 'decrypt']
            );

            data = await subtle.encrypt(
                {
                    name: 'AES-CBC',
                    iv: new TextEncoder().encode(this.data.iv)
                },
                u_key,
                new TextEncoder().encode(data)
            );

            data = auth.byteArrayToBase64(data);
        }

        return data;
    },

    async _decrypt(data) {
        if(this.data.encKey.length > 0) {
            // Encrypted data, need to decode base64 and convert to buffer array
            let u_encryptedData = auth.stringToArrayBufferView(atob(data));
            let u_key = await subtle.importKey(
                'raw',
                (new TextEncoder().encode(this.data.encKey)),
                'AES-CBC',
                true,
                ['encrypt', 'decrypt']
            );

            let u_data = await subtle.decrypt(
                {
                    name: 'AES-CBC',
                    iv: new TextEncoder().encode(this.data.iv)
                },
                u_key,
                u_encryptedData
            );

            data = new TextDecoder().decode(new Uint8Array(u_data));
        }

        return data;
    },

    async _calculateChecksum(data) {
        let u_checksum = '';

        if(this.data.checksumkey.length > 0) {
            // Only calculate the checksum over the first 512 KB (to prevent long running calculation on several MB requests)
            u_checksum = auth.byteArrayToString(await auth.hash(data.substr(0, 512 * 1024) + this.data.checksumkey + auth.get2FACode()));
        }

        return u_checksum;
    },

    _extentAjaxOptions(options) {
        let u_defaults = {
            url: '',
            verb: 'POST',
            data: {},
            success: function postDataSuccess(json) {
                return json;
            },
            error: function postDataError(error) {
                return error;
            }
        };

        return {...u_defaults, ...options};
    },

    ajax(options) {
        return new Promise((resolve) => {
            let u_conf = this._extentAjaxOptions(options);

            let u_sessID = auth.getSessionID();

            u_conf.verb = u_conf.verb.toUpperCase();

            if(u_conf.verb !== 'POST' && u_conf.verb !== 'GET' && u_conf.verb !== 'PUT' &&
                u_conf.verb !== 'DELETE' && u_conf.verb !== 'PATCH') {

                console.error('ERROR: Unknown HTTP verb: ' + u_conf.verb);
                return;
            }

            let u_promise = new Promise(resolve => resolve());
            if(u_sessID.length > 0 && this.data.encKey.length === 0) {
                // Calculate only once as soon as a user is logged in
                u_promise = this._calculateEncryptionAndChecksumKey();
            } else if(u_sessID.length === 0) {
                u_promise = this._resetEncryptionAndChecksumKey();
            }

            // just make sure to show the loading on large request handling (several MB)
            u_promise.then(() => {
                this.getAjaxObject(u_conf, resolve);
            });
        });
    },

    getAjaxObject(options, parentResolve) {
        let u_conf = this._extentAjaxOptions(options),
            u_data = JSON.stringify(u_conf.data);

        this._calculateChecksum(u_data).then((u_checksum) => {
            this._encrypt(u_data).then(async (u_encdata) => {
                let u_request = this.getRequestData(u_encdata, u_conf);

                let u_headers = {
                    's': auth.getSessionID(),
                    'c': u_checksum
                };

                if((u_conf.url !== 'user/checkDeviceID' && u_conf.url !== 'labels') || u_headers.s.length > 0) {
                    if(u_conf.device_id) {
                        u_headers.d = u_conf.device_id;
                    } else {
                        u_headers.d = await auth.getDeviceID();
                    }
                }

                let u_url = process.env.WEB_URL + '/REST/' + u_conf.url;
                let u_fetchData = {
                    method: u_conf.verb,
                    headers: {...{'Content-Type': 'text/json; charset=UTF-8'}, ...u_headers},
                    cache: 'no-cache'
                };

                if(u_conf.verb !== 'GET') {
                    u_fetchData.body = JSON.stringify({'jsonReq': u_request});
                }

				if(process.env.WEB_URL.indexOf('.local') > -1) {
					const https = require("https");
					u_fetchData.agent = new https.Agent({
					  rejectUnauthorized: false
					});
				}

                return fetch(u_url, u_fetchData)
                    .then(response => {
                        if(response.status === 401 || response.status === 403) {
							console.error('no permission', u_url);
                        }
						
                        return response.json();
                    })
                    .then(json => {
                        let u_decrypt_promise = new Promise(resolve => {
                            // Invalid returned json, or user logged out
                            if(json.cipherObject === undefined) {
                                return resolve(false);
                            }

                            // empty json returned
                            if(JSON.stringify(json.cipherObject) === '"{}"' || JSON.stringify(json.cipherObject) === '{}') {
                                return resolve({});
                            }

                            // Seems like a normal request, we try to decrypt it
                            this._decrypt(json.cipherObject).then(decrypted => {
                                // Now let's try to parse the JSON
                                try {
                                    return resolve(JSON.parse(decrypted));
                                } catch(e) {
                                    auth.loadLogin();
                                }
                            }).catch(() => {
                                console.error('Decrpytion of JSON failed! - Session invalid? - ' + u_conf.verb + ' ' + u_url + ' ' + JSON.stringify(u_data));
                                auth.loadLogin();
                            });
                        });

                        u_decrypt_promise.then(decryptedJSON => {
                            // If decryption did not work do not overwrite original json
                            if(decryptedJSON !== false) {
                                json = decryptedJSON;
                            }

                            let u_result = {};

                            if(json.error && json.error.toLowerCase() === 'no valid session') {
                                auth.loadLogin();
                            } else if(json.error && json.error.toLowerCase() === 'no permission') {
                                console.error('Error: No permission! - ' + u_url);
                            } else {
                                u_result = json;

                                // We can use the old fashioned way with success function or as async function
                                if(u_conf.success !== undefined && u_conf.success !== null) {
                                    u_conf.success(json);
                                }
                            }

                            parentResolve(u_result);
                        });
                    })
                    .catch(error => {
                        console.error('Error:', error);
                    });
            });
        });
    },

    getRequestData(u_data, u_conf) {
        let u_request = [];

        if(u_conf === undefined) {
            u_conf = {};
        }

        if(typeof u_data !== 'string') {
            u_data = JSON.stringify(u_data);
        }

        // Replace the euro sign to escaped unicode representation...
        u_data = u_data.replace(new RegExp(String.fromCharCode(8364), 'g'), '\\u20ac');

        // Split up records bigger data than 32K - there are languages which only support 32K
        while(u_data.length > 30000) {
            let u_reqJSON = {
                'data': u_data.substring(0, 30000)
            };

            u_request.push(u_reqJSON);
            // To save a little bit bandwidth
            u_data = u_data.substring(30000, u_data.length);
        }

        if(u_data.length > 0 && u_data.length <= 30000) {
            let u_reqJSON = {
                'data': u_data.substring(0, 30000)
            };

            u_request.push(u_reqJSON);
        }

        return u_request;
    }
};
