var crypto = require('crypto');
var randomstring = require('randomstring');
var iter = randomstring.generate();
console.log('crypt iter:', iter);

var algorithm = 'aes-256-ctr';
var password = randomstring.generate();
var iv = randomstring.generate(16);

function encrypt(text) {
	var cipher = crypto.createCipheriv(algorithm, password, iv);
	var crypted = cipher.update(text, 'utf8', 'hex');
	crypted += cipher.final('hex');
	return crypted;
}

function decrypt(text) {
	var decipher = crypto.createDecipheriv(algorithm, password, iv);
	var dec = decipher.update(text, 'hex', 'utf8');
	dec += decipher.final('utf8');
	return dec;
}

module.exports = {
	encrypt: encrypt,
	decrypt: decrypt,
	iter: iter,
};
