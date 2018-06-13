var exec = require('child_process').exec;

function run(name, script, res) {
	console.log(name);
	exec(`bash ${script}`, function(err, stdout, stderr) {
		if (err) {
			console.log(stderr);
			if (res) res.status(500).send(stderr);
			return;
		}
		(res ? res.send.bind(res) : console.info)(stdout);
	});
}

module.exports = run;
