/**
 * Defines and starts the HTTP server for mobile portal.
 */
'use strict';


var
	config          = require('x-configs')(__dirname+'/config'),
	http            = require('http'),
	https           = require('https'),
	path            = require('path'),
	express         = require('express'),
	compression     = require('compression'),
	body_parser     = require('body-parser'),
	method_override = require('method-override'),
	error_handler   = require('errorhandler'),
	
	log             = require('x-log'),
	merge           = require('x-common').merge,
	clusterize      = require('x-server-clusterize'),
	monitor         = require('x-server-monitor'),
	stats           = require('x-server-stats'),
	heapdump        = require('x-server-heapdump'),
	files           = require('x-middleware-files');

// TODO MOVE THIS to backend client config using reqqest libs' pool.maxSockets
require('http').globalAgent.maxSockets = config.agent.maxSockets;

var
	_error_handler        = errorHandler({showStack:process.env.NODE_ENV !== 'production'}),
	logging_error_handler = function(err, req, res, next) {
		if(err) {
			var
				error_log = req.log ? req.log(__filename) : log,
				msg       = typeof(err) === 'object' && err.message ? err.message : 'Internal Server Error',
				log_info  = err instanceof Error ? { error:{ status: err.status, message: err.message, stack: (''+err.stack).split('\n') } } : {error:err},
				status   = typeof(err) === 'object' && err.status ? err.status  : 500;
			
			log_info = extend(log_info,{request:{url:req.url,headers:req.headers}});
			error_log = error_log || log;
			error_log.error && error_log.error('server error handler caught error', log_info );
i			
			res.setHeader('Content-Type','text/plain');
			res.status(status).send(msg);
			return;
		}
		return _error_handler.apply(this, arguments);
	};


/** create the server */
var M;

module.exports = extend(M=function(options){
	config = options || config;
	
	var server = express(); // createServer is pre 3.0
	
	var http_server = http.createServer(server);
	server.http=http_server;
		if(config.https){
		try {
			var https_server = https.createServer({
				key  : fs.readFileSync( config.https.key  ),
				cert : fs.readFileSync( config.https.cert )
			}, function(req,res){
				// add ssl indicating headers to inform rest of pipeline, p.e. to be able to create correct absolute links in redirects
				extend(req.headers,{
					'x-forwarded-proto' : 'https'
				});
				server(req,res);
			});
			server.https=https_server;
		} catch( e ) {
			log.error && log.error('could not create the HTTPS server',e);
		}
	}
	
	server.configure(function () { // Configuration
		
		if(config.gzip) {
			// if no filter is defined, define one otherwise prepend one
			// wich will prevent a gzip encoding for redirects
			// note:
			var config_gzip = extend({}, config.gzip );
			config_gzip.filter = (function(orig_filter){
				return function(req,res){
					// debugger;
					if( res.statusCode > 299 && res.statusCode < 400 ) return false;
						return orig_filter ? orig_filter(req,res) : true;
				};
			})(config_gzip.filter || compression.filter );
			server.use( compression( config_gzip ) );
		}
		
		server.use(body_parser());
		server.use(method_override());
		if(config.files){
			server.use(require('x-middleware-files')(path.resolve(__dirname,config.files)));
		}
		server.use(server.router);
		server.use(logging_error_handler);
	});
	
	server.start = function (setup/*function to setup routes*/, options/*port,pidFile*/, cb) {
		
		if( typeof(options) === 'function' ) {
			cb      = options;
			options = {};
		}
		options = merge({}, config, options);
		cb      = cb || options.callback;
		
		this.config = options;
		
		// used option.port or default-value
		var http_port = options.port = options.port || 38080;
		var https_port;
		if( options.https ){
			https_port = options.https.port = options.https.port || http_port-1;
		}
		
		
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
		
		//--SETUP HTTP LISTENER---
		this.http.listen(http_port);
		this.http.once('listening', function(err) {
			if(err) {
				log.error && log.error('HTTP Server not listening', err);
				cb(err);
				return;
			}
			log.info && log.info('HTTP Server listening on port ' + http_port + ' in ' + (process.env.NODE_ENV || 'development') + ' mode');
			cb && cb(null,this);
		});
		
		//--SETUP HTTPS LISTENER---
		if( this.https && options.https && https_port ){
			this.https.listen(https_port);
			this.https.once('listening', function(err) {
				if(err) {
					log.error && log.error('HTTPS Server not listening', err);
					cb(err);
					return;
				}
				log.info && log.info('HTTPS Server listening on port ' + https_port + ' in ' + (process.env.NODE_ENV || 'development') + ' mode');
				cb && cb(null,this);
			});
		}
		
		heapdump();	
	};
	
	server.stop = function (){
		this.http.close();
		
		if(log.info)log.info('server closed');
	};
	
	
	// setup and then start
	server.main = function (script, setup/*function to setup routes*/, options) {
		options = options || {};
		
		var self = this;
		
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
								log.error && log.error('Could not start MCE Mock server ' + error, error);
							}
						}
						
						var port = options.port || 18080;
						for (var pid in cluster.workers) { // each worker an own monitor
							cluster.workers[pid].send({action:'start', subject:'monitor', options:{port:++port}});
						}
					},
					function () {
						// start a server for workers
						self.start(setup, options);
						
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
			} else {
				// start a monitor for this process with stats
				var mon = monitor().start(options.port ? {port:options.port + 1} : {});
				stats.setup(mon);
				
				log.setup(mon);
				
				self.start(setup, options);
			}
		}
	};
},{
	// create server then call main on it
	main : function (script, setup/*function to setup routes*/, options) {
		//not started stand alone
		if( !node( script ) ){
			return;
		}
		
		M().main( script, setup, options );
	}
});
