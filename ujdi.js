var express = require( "express" );
var optimist = require( "optimist" );
var S = require( "string" );
var _ = require( "underscore" );
var Q = require( "q" );
var async = require( "async" );
var redis = require( "redis" );
var http = require( "http" );
var url = require( "url" );
var fs = require( "fs" );
var util = require( "util" );

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
				-> ujdi/

		Transactions are grouped as directories with all the needed files.
		
		The transaction name, directory name and the module name
			should be the same.

		On boot call, ujdi will create ruleset and transaction folder if it is not yet
			existing.

		There are two modes here the default is using ujdi as a 
			standalone server.

		ujdi --middleware
			This will boot the ujdi as a middleware extension providing
				transaction-manager.js and ruleset-manager.js

		ujdi --noEmptyError
			This will force ujdi to ignore empty ruleset or transaction
				collection.
*/

var arguments = optimist.argv;

var UJDI_VARIABLES = {
	"noEmptyError": !!arguments.noEmptyError,
	"middleware": !!arguments.middleware
};

console.log( JSON.stringify( UJDI_VARIABLES ) );

var createDirectoryStructure = function createDirectoryStructure( callback ){
	async.parallel( [
			function( callback ){
				fs.exists( "../transaction",
					function( exists ){
						if( !exists ){
							fs.mkdir( "../transaction",
								function( error ){
									if( error ){
										console.log( error );
									}
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
									if( error ){
										console.log( error );
									}
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
				if( !UJDI_VARIABLES.noEmptyError ){
					error = new Error( "empty transaction engines" );	
				}
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
						if( !UJDI_VARIABLES.noEmptyError ){
							error = new Error( "empty transaction engine at " + directoryPath );	
						}
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

var processTransactionData = function processTransactionData( transactionEngineList, callback ){
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
			processTransactionData
		],
		function( error, transactionList ){
			if( error ){
				console.log( error );
			}
			for( var index in transactionList ){
				var category = transactionList[ index ].transactionCategory;
				transactionList[ category ] = transactionList[ index ].transactionList;
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
				if( !UJDI_VARIABLES.noEmptyError ){
					error = new Error( "empty ruleset engines" );	
				}
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
						if( !UJDI_VARIABLES.noEmptyError ){
							error = new Error( "empty ruleset engine at " + directoryPath );	
						}
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

var processRulesetData = function processRulesetData( rulesetEngineList, callback ){
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

/*
	Basically a ruleset of certain transaction category
		should follow the standard ruleset structure.

	When a ruleset is required, it will load a single
		object 'ruleset' containing the following information
		{
			"transactionID": "transaction name or transaction path",
			"preRuleSet": [
				//Array of functions
			],
			"mainRuleSet": {
				"ruleSet": [
					//Array of functions
				],
				"executionMode": "waterfall|parallel"
			},
			"postRuleSet": [
				//Array of functions
			]
		}

	Note that we don't permit parallel/asynchronous execution
		during pre and post rule set execution. Because
		this is a performance issue. And the design does not
		permit this flow.

	All rulesets in those fields are executed using waterfall mode.

	All post ruleset are executed AFTER the transaction executes.
	If the transaction is a continous process then post ruleset 
		will not be executed.

	Note also that when the transaction is finished, and
		the main ruleset dictates that it should continue processing
		then the post ruleset may proceed execution.
*/
var loadAllRulesets = function loadAllRulesets( callback ){
	async.waterfall( [
			readRulesetDirectory,
			filterRulesetDirectory,
			readRulesetEngines,
			processRulesetData
		],
		function( error, rulesetList ){
			if( error ){
				console.log( error );
			}
			for( var index in rulesetList ){
				var category = rulesetList[ index ].rulesetCategory;
				rulesetList[ category ] = rulesetList[ index ].rulesetList;
			}
			callback( error, rulesetList );
		} );
};

/*
	By interpolating transaction rules,
		we are merging transactions together with the
		rulesets.

	Main priority when merging is on the transactions
		transaction dictates what transaction it will be redirected
		to and what ruleset it will follow.

	Each transaction governs a 3 subset of ruleset.
	A transaction can have a default ruleset associated to it.
	A basic ruleset compose of pre, post and the main ruleset.
	A pre ruleset is called before the transaction,
		a post ruleset is called after the transaction.
	A main ruleset is called either together or anywhere
		within the execution of the transaction.

	Each transaction needs the following basic data requirements:
		1. transaction ID / transaction phrase.
		2. transaction data - 64bit encoded or raw json

	Interpolating transaction rules will not register
		the transaction this will only return 
		a list of successful interpolated transacton rules.

	Basically, it will construct an async waterfall/parallel engine
		that will call the rulesets and the transactions.

	Transactions and rulesets communicated via OCIS Interface standards.
*/
var interpolateTransactionRules = function interpolateTransactionRules( transactionList, rulesetList, callback ){
	var mergedTransactionRules = [ ];

};

var test = function test( ){
	async.parallel( [
			createDirectoryStructure,
			loadAllTransactions,
			loadAllRulesets,
		],
		function( error, results ){
			if( error ){
				console.log( error );
			}
			console.log( util.inspect( results, { "depth": 5 } ) );
		} );
};
test( );

var createUjdiServer = function createUjdiServer( ){
	/*
		If --middleware is activated, we will just create a proxy engine server.
		Normally by default, we will create a public server and a local proxy engine server.
		The public server will be the one to communicate outside of its domain
			while the local proxy engine server will manage the ujdi engine.
	*/
};

