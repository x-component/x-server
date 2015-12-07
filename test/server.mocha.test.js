'use strict';

/* globals describe, it, before */

var assert = require('assert');
var request = require('supertest');
var server = require('../server')();
var bodyParser = require('body-parser');

var app = {};
var serverurl = 'http://localhost:18080';

app.setup = function(server) {
	server.all( '/', bodyParser.urlencoded({ extended: 'querystring' }),
		function(req, res, next) {
			var out = (req.method === 'POST' ? req.body : req.query);
			res.send(JSON.stringify(out));
		}
	);
	server.all( '/json', bodyParser.json(),
		function(req, res, next) {
			var out = (req.method === 'POST' ? req.body : req.query);
			res.json(out);
		}
	);
	server.get( '/test4', function(req, res, next) {
		res.sendStatus(400);
	});
	server.post( '/test4', function(req, res, next) {
		res.sendStatus(403);
	});
};

describe('server tests', function(){
	var _server;
	var _err;
	
	// start the server
	before(function(done){
		server.start(app.setup, function(err, server){
			_err = err;
			_server = server;
			done();
		});
	});
	
	it('started without error', function(){
		assert.ok(_err === null);
	});
	
	it('returns server object', function(){
		assert.ok(_server.domain === null);
	});
	
	it('GET /ping - monit keepalive', function(done){
		request(serverurl)
		.get('/ping')
		.expect(200)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('GET /alive - loadbalancer health check', function(done){
		request(serverurl)
		.get('/alive')
		.expect(200)
		.expect('Content-Type',"text/plain")
		.expect('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			assert.equal(res.text, 'healthy');
			done();
		});
	});
	
	it('GET /', function(done){
		request(serverurl)
		.get('/')
		.expect(200)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('GET /?query', function(done){
		request(serverurl)
		.get('/?q=query&data=%C3%84%E2%82%AC~%C2%B5')
		.expect(200)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			assert.equal(res.text, '{"q":"query","data":"Ä€~µ"}');
			done();
		});
	});
	
	it('POST / query', function(done){
		request(serverurl)
		.post('/')
		.send('q=query&data=%C3%84%E2%82%AC~%C2%B5')
		.expect(200)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			assert.equal(res.text, '{"q":"query","data":"Ä€~µ"}');
			done();
		});
	});
	
	it('GET /json', function(done){
		request(serverurl)
		.get('/json?q=query&data=%C3%84%E2%82%AC~%C2%B5')
		.set('Accept', 'application/json')
		.expect(200)
		.expect('Content-Type', /json/)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			assert.deepEqual(res.body, {"q":"query","data":"Ä€~µ"});
			done();
		});
	});
	
	it('POST /json', function(done){
		request(serverurl)
		.post('/json')
		.set('Accept', 'application/json')
		.send({"q":"query","data":"Ä€~µ"})
		.expect(200)
		.expect('Content-Type', /json/)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			assert.deepEqual(res.body, {"q":"query","data":"Ä€~µ"});
			done();
		});
	});
	
	it('HEAD /', function(done){
		request(serverurl)
		.head('/')
		.expect(200)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('HEAD /notfound', function(done){
		request(serverurl)
		.head('/notfound')
		.expect(404)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('GET /test4', function(done){
		request(serverurl)
		.get('/test4')
		.expect(400)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('POST /test4', function(done){
		request(serverurl)
		.post('/test4')
		.send('')
		.expect(403)
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.message, undefined);
			done();
		});
	});
	
	it('stop the server', function(done){
		server.stop();
		request(serverurl)
		.get('/')
		.end(function(err, res) {
			err = err || {};
			assert.equal(err.code, 'ECONNREFUSED');
			done();
		});
	});
});
