/**
 * Defines and starts the HTTP server for mobile portal.
 */
'use strict';


var
	config     = require('x-configs')(__dirname+'/config'),
	http       = require('http'),
	path       = require('path'),
	express    = require('express'),
	log        = require('x-log'),
	merge      = require('x-common').merge,
	clusterize = require('x-server-clusterize'),
	monitor    = require('x-server-monitor'),
	stats      = require('x-server-stats'),
	heapdump   = require('x-server-heapdump'),
	files      = require('x-middleware-files');

// TODO MOVE THIS to backend client config using reqqest libs' pool.maxSockets
require('http').globalAgent.maxSockets = config.agent.maxSockets;

var errorHandler = express.errorHandler({showStack:process.env.NODE_ENV != 'production'}),
	loggingErrorHandler = function (err, req, res, next) {
		if (err){
			var errorLog = req.log ? req.log(__filename) : log;
			errorLog = errorLog || log;
			if (errorLog.error) errorLog.error("server error handler caught error:" + err.stack);
		}
		return errorHandler.apply(this, arguments);
	};

/** create the server */
var server = module.exports = express(); // createServer is pre 3.0

var http_server = http.createServer(server);
server.http=http_server;

//tester.setup(server);

server.configure(function () { // Configuration
	
	if(config.gzip) server.use(express.compress( config.gzip ));
	
	server.use(express.bodyParser());
	server.use(express.methodOverride());
	if(config.files){
		server.use(require('x-middleware-files')(path.resolve(__dirname,config.files)));
	}
	server.use(server.router);
	server.use(loggingErrorHandler);
});

server.start = function (setup/*function to setup routes*/, options/*port,pidFile*/) {
	options = merge({}, config, options);
	
	this.config = options;
	
	var port = options.port || 38080;
	
	this.get('/ping', function (req, res) {
		res.send(200);
	});	// called by monit
	this.get('/alive', function (req, res) {  // called by load balancer
		res.writeHead(200, {'Content-Type':"text/plain"});
		res.write("healthy");
		res.end();
	});
	
	// provide the current server configuration for all requests
	this.all('*', function( req, res, next ){
		merge(req,{ server:{ config:config } } );
		next && next();
	});
	
	
	setup(this);
	
	this.http.listen(port,function(){
		if (log.info){ log.info('server listening on port ' + port + ' in ' + this.settings.env + ' mode'); }
	});
	
	heapdump();	
};

server.stop = function (){
	this.http.close();
	
	if(log.info)log.info('server closed');
};


// setup and then start
server.main = function (script, setup/*function to setup routes*/, options) {
	options = options || {};
	
	var _ = this;
	
	if (require('fs').realpathSync(require('path').resolve(process.argv[1])) == script){//started stand alone
		
		if (process.argv[2])options.port = process.argv[2];
		
		if (process.env.NODE_ENV && !~process.env.NODE_ENV.indexOf('development')){
			
			var cluster = new clusterize(
				function () {
					
					// start mock
					if ( !process.env.NODE_ENV
					  || ~process.env.NODE_ENV.indexOf('development')
					  || ~process.env.NODE_ENV.indexOf('test')
					   ) {
						
						try {
							require('../backend/mce/mock/server').start();
						} catch(error) {
							if (log.error) log.error('Could not start MCE Mock server ' + error, error);
						}
					}
					
					var port = options.port || 38080;
					for (var pid in cluster.workers) { // each worker an own monitor
						cluster.workers[pid].send({action:'start', subject:'monitor', options:{port:++port}});
					}
				},
				function () {
					// start a server for workers
					_.start(setup, options);
					
					// upon request by parent process start an own monitor with stats
					process.on('message', function (m) {
						if( m.action && 'start' === m.action && m.subject && 'monitor' == m.subject ){
							var mon = monitor().start(m.options);
							stats.setup(mon);
							log.setup(mon);
						}
					});
				},
				options
			);
			cluster.start();
		}
		else {
			// start a monitor for this process with stats
			var mon = monitor().start(options.port ? {port:options.port + 1} : {});
			stats.setup(mon);
			log.setup(mon);
			
			_.start(setup, options);
		}
	}
};
