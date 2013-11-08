var express = require( "express" );
var optimist = require( "optimist" );
var S = require( "string" );
var _ = require( "underscore" );
var Q = require( "q" );
var http = require( "http" );
var url = require( "url" );
var fs = require( "fs" );

/*
	Ujdi
		Albanian word for "transaction". Ujdi implements the
			transaction based request layer on top of Express middleware.

		Transaction based request is a concept wherein clients sends data
			via a transaction phrase or a transaction id. And data are
			tracked via transaction entries per transaction type.

		On booting ujdi, it can be added as an extension to the middleware
			or it can be used as a server itself.

		* Note: If you want to customize your server you can adapt
			ujdi as an extension middleware.

		Ujdi also implements and manages its own database.
		The database is then synced with the original storage via
			sync endpoints.

		Ujdi requires a transaction folder and a ruleset folder.

		The transaciton folder contains all the transaction engines
			for facilitating and processing request via transactions.

		Rulesets folder contains the interfaces, filters, controllers and verifiers
			for every transaction request. Rulesets changes the flow
			of the transaction.

		The directory structure should be strictly followed like this:
			root-server-directory/
				-> node_modules/
				-> ruleset/
				-> transaction/
				-> udji/

		On boot call, udji will create ruleset and transaction folder if it is not yet
			existing.

		There are two modes here the default is using ujdi as a 
			standalone server.

		ujdi --middleware
			This will boot the ujdi as a middleware extension providing
			transaction-manager.js and ruleset-manager.js
*/

var createDirectoryStructure = function createDirectoryStructure( callback ){
	async.parallel( [
			function( callback ){
				fs.exists( "../transaction",
					function( exists ){
						if( !exists ){
							fs.mkdir( "../transaction",
								function( error ){
									callback( error );
								} );	
						}else{
							callback( );
						}
					} );
			},

			function( callback ){
				fs.exists( "../ruleset",
					function( exists ){
						if( !exists ){
							fs.mkdir( "../ruleset",
								function( error ){
									callback( error );
								} );	
						}else{
							callback( );
						}
					} );
			}
		],
		function( error ){
			callback( error );
		} );
};

var readTransactionDirectory = function readTransactionDirectory( callback ){
	fs.readdir( "../transaction",
		function( error, fileList ){
			if( error ){
				console.log( error );
			}
			if( !error && _.isEmpty( fileList ) ){
				console.log( "Empty transaction engines!" );
				error = new Error( "empty transaction engines" );
			}
			callback( error, fileList );
		} );
};

var filterTransactionDirectory = function filterTransactionDirectory( fileList, callback ){
	async.map( fileList,
		function( fileName, callback ){
			var filePath = "../transaction/" + fileName
			fs.stat( filePath,
				function( error, fileStatistic ){
					if( error ){
						console.log( error );
					}
					if( fileStatistic.isDirectory( ) ){
						callback( null, filePath );	
					}else{
						callback( error );
					}
				} );
		},
		function( error, directoryList ){
			if( error ){
				console.log( error );
			}
			directoryList = _.compact( directoryList );
			callback( error, directoryList );		
		} );
};

var readTransactionEngines = function readTransactionEngines( directoryList, callback ){
	async.map( directoryList,
		function( directoryPath, callback ){
			fs.readdir( directoryPath,
				function( error, fileList ){
					if( error ){
						console.log( error );
					}
					if( _.isEmpty( fileList ) ){
						console.log( "Empty transaction engine at " + directoryPath );
						error = new Error( "empty transaction engine at " + directoryPath );
					}
					callback( error, {
						"directoryPath": directoryPath,
						"fileList": fileList
					} );
				} );
		},
		function( error, transactionEngineList ){
			if( error ){
				console.log( error );
			}
			callback( error, transactionEngineList );
		} );
};

var processTransactionInformation = function processTransactionInformation( transactionEngineList, callback ){
	async.map( transactionEngineList,
		function( transactionEngine, callback ){
			var directoryPath = transactionEngine.directoryPath;
			var fileList = transactionEngine.fileList;
			async.map( fileList,
				function( fileName, callback ){
					var filePath = directoryPath + "/" + fileName;
					fs.stat( filePath,
						function( error, fileStatistic ){
							if( error ){
								console.log( error );
							}
							if( !error && fileStatistic 
								&& fileStatistic.isFile( ) )
							{
								var transactionName = fileName.replace( /\..+/, "" );
								transactionName = S( transactionName ).camelize( ).toString( );
								var transaction = require( filePath );
								callback( null, {
									"filePath": filePath,
									"transactionName": transactionName,
									"transaction": transaction[ transactionName ]
								} );
							}else{
								callback( error );
							}
						} );
				},
				function( error, transactionList ){
					if( error ){
						console.log( error );
						callback( error )
						return;
					}
					callback( null, {
						"transactionCategory": directoryPath.match( /[-\w]+?$/ )[ 0 ],
						"transactionList": transactionList
					} );
				} );
		},
		function( error, transactionList ){
			if( error ){
				console.log( error );
			}
			callback( error, transactionList );
		} );
};

var loadAllTransactions = function loadAllTransactions( callback ){
	async.waterfall( [
			readTransactionDirectory,
			filterTransactionDirectory,
			readTransactionEngines,
			processTransactionInformation
		],
		function( error, transactionList ){
			if( error ){
				console.log( error );
			}
			callback( error, transactionList );
		} );
};

var readRulesetDirectory = function readRulesetDirectory( callback ){
	fs.readdir( "../ruleset",
		function( error, fileList ){
			if( error ){
				console.log( error );
			}
			if( !error && _.isEmpty( fileList ) ){
				console.log( "Empty ruleset engines!" );
				error = new Error( "empty ruleset engines" );
			}
			callback( error, fileList );
		} );
};

var filterRulesetDirectory = function filterRulesetDirectory( fileList, callback ){
	async.map( fileList,
		function( fileName, callback ){
			var filePath = "../ruleset/" + fileName
			fs.stat( filePath,
				function( error, fileStatistic ){
					if( error ){
						console.log( error );
					}
					if( fileStatistic.isDirectory( ) ){
						callback( null, filePath );	
					}else{
						callback( error );
					}
				} );
		},
		function( error, directoryList ){
			if( error ){
				console.log( error );
			}
			directoryList = _.compact( directoryList );
			callback( error, directoryList );		
		} );
};

var readRulesetEngines = function readRulesetEngines( directoryList, callback ){
	async.map( directoryList,
		function( directoryPath, callback ){
			fs.readdir( directoryPath,
				function( error, fileList ){
					if( error ){
						console.log( error );
					}
					if( _.isEmpty( fileList ) ){
						console.log( "Empty ruleset engine at " + directoryPath );
						error = new Error( "empty ruleset engine at " + directoryPath );
					}
					callback( error, {
						"directoryPath": directoryPath,
						"fileList": fileList
					} );
				} );
		},
		function( error, rulesetEngineList ){
			if( error ){
				console.log( error );
			}
			callback( error, rulesetEngineList );
		} );
};

var processRulesetInformation = function processRulesetInformation( rulesetEngineList, callback ){
	async.map( rulesetEngineList,
		function( rulesetEngine, callback ){
			var directoryPath = rulesetEngine.directoryPath;
			var fileList = rulesetEngine.fileList;
			async.map( fileList,
				function( fileName, callback ){
					var filePath = directoryPath + "/" + fileName;
					fs.stat( filePath,
						function( error, fileStatistic ){
							if( error ){
								console.log( error );
							}
							if( !error && fileStatistic 
								&& fileStatistic.isFile( ) )
							{
								var rulesetName = fileName.replace( /\..+/, "" );
								rulesetName = S( rulesetName ).camelize( ).toString( );
								var ruleset = require( filePath );
								callback( null, {
									"filePath": filePath,
									"rulesetName": rulesetName,
									"ruleset": ruleset[ rulesetName ]
								} );
							}else{
								callback( error );
							}
						} );
				},
				function( error, rulesetList ){
					if( error ){
						console.log( error );
						callback( error )
						return;
					}
					callback( null, {
						"rulesetCategory": directoryPath.match( /[-\w]+?$/ )[ 0 ],
						"rulesetList": rulesetList
					} );
				} );
		},
		function( error, rulesetList ){
			if( error ){
				console.log( error );
			}
			callback( error, rulesetList );
		} );
};

var loadAllRulesets = function loadAllRulesets( callback ){
	async.waterfall( [
			readRulesetDirectory,
			filterRulesetDirectory,
			readRulesetEngines,
			processRulesetInformation
		],
		function( error, rulesetList ){
			if( error ){
				console.log( error );
			}
			callback( error, rulesetList );
		} );	
};

var createUjdiServer = function createUjdiServer( ){

};

