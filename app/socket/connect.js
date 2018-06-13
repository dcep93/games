var crypt = require('./crypt');

var rooms = {}; // {string: {string: {state: object, nextId: int, clients: {int: {index: int, client: ?Client}}}}}
var clientToRoom = {}; // int: {room: string, game: string}
var updated = new Date();

function getRoom(roomInfo) {
	if (roomInfo === undefined) return undefined;
	return getRoomGame(roomInfo.game)[roomInfo.room];
}

function setRoom(roomInfo, room) {
	getRoomGame(roomInfo.game)[roomInfo.room] = room;
}

function getRoomGame(game) {
	var roomGame = rooms[game];
	if (roomGame === undefined) {
		roomGame = {};
		rooms[game] = roomGame;
	}
	return roomGame;
}

function connect(client) {
	var clientId; // int
	var roomInfo; // {room: string, game: string}
	var roomString; // string
	client.on('register', function(data) {
		clientId =
			data.iter === crypt.iter ? crypt.decrypt(data.id) : undefined;
		roomInfo = clientToRoom[clientId];
		var room = getRoom(roomInfo);
		console.log('register', clientId, roomInfo, data, room !== undefined);
		if (room !== undefined) {
			roomString = JSON.stringify(roomInfo);
			var clientO = room.clients[clientId];
			clientO.client = client;
			client.join(roomString);
			client.send({
				endpoint: 'register',
				room: roomInfo.room,
				state: room.state,
				index: clientO.index,
				original: room.original,
				updated: updated,
			});
		} else {
			client.send({ endpoint: 'register' });
		}
	});
	client.on('disconnect', function() {
		console.log('disconnect', clientId, roomInfo);
		if (roomInfo !== undefined) leave(false);
	});
	client.on('reconnect', function() {
		var room = getRoom(roomInfo);
		console.log('reconnect', clientId, room !== undefined);
		if (room !== undefined) {
			room.clients[clientId].client = client;
			client.join(roomString);
			client.send({
				endpoint: 'reconnect',
				state: room.state,
				index: room.clients[clientId].index,
			});
		} else {
			client.send({ endpoint: 'refresh' });
		}
	});
	function leave(forLeave) {
		var room = getRoom(roomInfo);
		if (room === undefined) return false;
		var c = kick(clientId, forLeave);
		var obj = { endpoint: 'room', left: c.index };
		if (c.index === room.state.admin) {
			for (var adminId in room.clients) {
				clientO = room.clients[adminId];
				if (clientO.client !== undefined) {
					clientO.client.send(obj);
					break;
				}
			}
		} else {
			client.to(roomString).broadcast.emit('message', obj);
		}
		setTimeout(function() {
			checkEmptyRoom(roomInfo);
		}, 3000);
		return true;
	}
	function kick(kickId, forKick) {
		var clientO = getRoom(roomInfo).clients[kickId];
		if (forKick) {
			console.log('kick', clientId, roomInfo, clientO !== undefined);
			delete clientToRoom[kickId];
			if (clientO.client !== undefined) {
				clientO.client.send({ endpoint: 'initState' });
				clientO.client.leave(roomString);
			}
		}
		if (clientO) clientO.client = undefined;
		return clientO;
	}
	client.on('room', function(data) {
		if (data.endpoint === 'register') {
			if (clientToRoom[clientId] === undefined) {
				if (data.room !== undefined && data.game !== undefined) {
					var room = getRoom(data);
					if (room && room.state.closed) {
						client.send({ endpoint: 'room', room: false });
						return;
					} else {
						roomInfo = { room: data.room, game: data.game };
						clientToRoom[clientId] = roomInfo;
						roomString = JSON.stringify(roomInfo);
						var obj = {
							endpoint: 'room',
							name: data.name,
							room: roomInfo.room,
						};
						if (!room) {
							obj.admin = 0;
							room = { nextId: 1, clients: {} };
							setRoom(roomInfo, room);
						}
						if (room.clients[clientId] !== undefined) {
							obj.index = room.clients[clientId].index;
						} else {
							obj.index = Object.keys(room.clients).length;
						}
						room.clients[clientId] = {
							index: obj.index,
							client: client,
						};
						client.join(roomString);
						client.send(obj);
						client.to(roomString).broadcast.emit('message', {
							endpoint: obj.endpoint,
							name: obj.name,
							index: obj.index,
						});
						return;
					}
				} else {
					console.log('room', 'bad data', data);
				}
			} else {
				console.log('room', 'unknown client', clientId);
			}
		} else if (data.endpoint === 'kick') {
			var room = getRoom(roomInfo);
			if (room !== undefined) {
				for (var kickId in room.clients) {
					var clientO = room.clients[kickId];
					if (clientO.index === data.index) {
						kick(kickId, true);
						client.send({ endpoint: 'room', kicked: data.index });
						return;
					}
				}
				console.log('room', 'no client matched', data, room.clients);
			} else {
				console.log('no room', roomInfo);
			}
		} else if (data.endpoint === 'leave') {
			if (leave(true)) return;
		} else {
			console.log('room', 'endpoint', data);
		}
	});
	client.on('refresh', function(data) {
		if (data.iter !== crypt.iter) return;
		if (data.game === undefined || data.room === undefined) return;
		roomInfo = { game: data.game, room: data.room };
		var room = getRoom(roomInfo);
		if (room === undefined) {
			room = { clients: {} };
			getRoomGame(data.game)[data.room] = room;
		}
		clientId = crypt.decrypt(data.id);
		clientToRoom[clientId] = roomInfo;
		room.clients[clientId] = { index: data.index };
		if (data.state !== undefined) {
			room.original = data.state;
			room.state = data.state;
			room.nextId = data.state.id + 1;
			console.log('refresh', clientId, roomInfo);
		}
		client.send({ endpoint: 'refresh' });
	});
	client.on('message', function(data) {
		var room = getRoom(roomInfo);
		if (room !== undefined) {
			data.id = room.nextId++;
			client.to(roomString).broadcast.emit('message', data);
			client.send(data);
			room.state = data.state;
		}
	});
}

function checkEmptyRoom(roomInfo) {
	var roomGame = getRoomGame(roomInfo.game);
	var room = roomGame[roomInfo.room];
	if (room === undefined) return;
	var clients = room.clients;
	for (var otherClientId in clients) {
		if (clients[otherClientId].client !== undefined) return;
	}
	console.log('ending room', roomInfo);
	for (var otherClientId in clients) {
		if (clientToRoom[otherClientId] === roomInfo)
			delete clientToRoom[otherClientId];
	}
	delete roomGame[roomInfo.room];
}

module.exports = connect;
