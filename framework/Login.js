const {network} = require("./Network");
const auth = require("./Auth").auth;

exports.login = (fixedDeviceID) => new Promise((resolve, reject) => {
    network.ajax({url: 'user/get', data: {email: process.env.WEB_EMAIL}}).then((json) => {
        let _prepareLoginCred = async function _prepareLoginCred(userJSON) {
            auth.setLoginParameters(userJSON.n, userJSON.i);
            return await auth.pepperPassword(process.env.WEB_PASSWORD, userJSON.p);
        }

        _prepareLoginCred(json).then(async (password) => {
            let u_data = {
                email: process.env.WEB_EMAIL,
                pwd: password,
                device_id: fixedDeviceID ? fixedDeviceID : await auth.getDeviceID()
            };

            network.ajax({
                url    : 'user/login',
                data   : u_data
            }).then((json) => {
                if (json.sessionID === undefined || json.sessionID.length <= 0) {
                    console.error('No session');
                    return;
                }

                auth.setSessionID(json.sessionID, true).then(function() {
                    resolve(json);
                });
            })
        })
    });
});
