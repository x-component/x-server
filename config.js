"use strict";

var
	merge = require('x-common').merge,
	zlib  = require('zlib');

var generic = {
	hostname : '127.0.0.1',
	port :     18080,
	protocol:  'http',
	
	rewrite : {
		// hostname : 'x-node', // a hostname refering to varnish instane
		port :     28080 // varnish port
	},
	
	agent : {
		maxSockets : 1024
	},
	
	// see http://nodejs.org/api/zlib.html#zlib_options
	gzip: {
		level     : zlib.Z_BEST_SPEED,
		strategy  : zlib.Z_DEFAULT_STRATEGY,
		threshold : 1024 // do not compress if size < 1024 (and this can be detected)
		
		// chunkSize (default: 16*1024)
		// windowBits
		// level:     0-9 where 0 is no compression, and 9 is slow but best compression
		// memLevel:  1-9 low is slower but uses less memory, high is fast but uses more
		// strategy:  compression strategy
	},
	
	//files : '../../public' // where node_modules is
	
	clusterize: {
		count: require('os').cpus().length
	},
	
	// version string
	version: ( function (){ // TODO PATH
		var
			version_path = __dirname + '/public/version/version.txt',
			data;
		try {
			data = require('fs').readFileSync(version_path).toString();
			if (!data) {
				throw new Error('Version could not be read from "' + version_path + '".');
			}
		}  catch (e) {
			console.log(e);
			process.exit(1);
		}
		return {string:data,hash:require('../util/hash').string(data,{hash:'md5',encoding:'hex'})};
	})()
};

module.exports = {
	development: merge( {}, generic, {
		rewrite: {
			port:138080 // no varnish locally
		},
		
		/*https: {
			// port:  otherwise it is the http port -1
			key : __dirname + '/ssl/development.server.private-key.out',
			cert: __dirname + '/ssl/development.server.cert.pem'
		},
		*/
		
		clusterize: merge.remove,
		
		version:(function(){ // this influences client caching: in development create a new hash on each restart
			var now = Date.now();
			return {string:''+now,hash:require('../util/hash').string(''+now,{hash:'md5',encoding:'hex'})};
		})()
	}),
	
	test: generic,
	
	production: generic,
	
	production_debug: merge( {}, generic, { // to start locally in with production mode, if a wrong behavior only occurs in production mode
		clusterize: merge.remove  // preven clusterize to be able to debug
	})
};
