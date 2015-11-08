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
	gzip : {
		level    : zlib.Z_BEST_SPEED,
		strategy : zlib.Z_DEFAULT_STRATEGY
		
		// chunkSize (default: 16*1024)
		// windowBits
		// level: 0-9 where 0 is no compression, and 9 is slow but best compression
		// memLevel: 1-9 low is slower but uses less memory, high is fast but uses more
		// strategy: compression strategy
	},
	
	files : '../../public' // where node_modules is
};

module.exports = {
	development : merge( {}, generic, {
		rewrite : {
			port : 18080 // no varnish locally
		}
	}),
	
	test :       generic,
	
	production : generic
};
