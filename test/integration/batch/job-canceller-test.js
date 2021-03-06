'use strict';

require('../../helper');

var BATCH_SOURCE = '../../../lib/batch/';

var assert = require('../../support/assert');
var redisUtils = require('../../support/redis-utils');

var BatchLogger = require(BATCH_SOURCE + 'batch-logger');
var JobQueue = require(BATCH_SOURCE + 'job-queue');
var JobBackend = require(BATCH_SOURCE + 'job-backend');
var JobPublisher = require(BATCH_SOURCE + 'pubsub/job-publisher');
var jobStatus = require(BATCH_SOURCE + 'job-status');
var JobCanceller = require(BATCH_SOURCE + 'job-canceller');
var JobFactory = require(BATCH_SOURCE + 'models/job-factory');
var PSQL = require('cartodb-psql');

var logger = new BatchLogger(null, 'batch-queries');
var metadataBackend = require('cartodb-redis')({ pool: redisUtils.getPool() });
var jobPublisher = new JobPublisher(redisUtils.getPool());
var jobQueue = new JobQueue(metadataBackend, jobPublisher, logger);
var jobBackend = new JobBackend(metadataBackend, jobQueue, logger);

var USER = 'vizzuality';
var QUERY = 'select pg_sleep(0)';
var HOST = 'localhost';

// sets job to running, run its query and returns inmediatly (don't wait for query finishes)
// in order to test query cancelation/draining
function runQueryHelper (job, callback) {
    var jobId = job.job_id;
    var sql = job.query;

    job.status = jobStatus.RUNNING;

    jobBackend.update(job, function (err) {
        if (err) {
            return callback(err);
        }

        const dbConfiguration = {
            host: job.host,
            port: job.port,
            dbname: job.dbname,
            user: job.dbuser,
            pass: job.pass
        };

        const pg = new PSQL(dbConfiguration);

        sql = '/* ' + jobId + ' */ ' + sql;

        pg.eventedQuery(sql, function (err, query) {
            if (err) {
                return callback(err);
            }

            callback(null, query);
        });
    });
}

function createWadusJob (query) {
    query = query || QUERY;
    return JobFactory.create(JSON.parse(JSON.stringify({
        user: USER,
        query: query,
        host: HOST,
        dbname: 'cartodb_test_user_1_db',
        dbuser: 'test_cartodb_user_1',
        port: 5432,
        pass: 'test_cartodb_user_1_pass'
    })));
}

describe('job canceller', function () {
    var jobCanceller = new JobCanceller();

    after(function (done) {
        redisUtils.clean('batch:*', done);
    });

    it('.cancel() should cancel a job', function (done) {
        var job = createWadusJob('select pg_sleep(1)');

        jobBackend.create(job.data, function (err, jobCreated) {
            if (err) {
                return done(err);
            }

            assert.strictEqual(job.data.job_id, jobCreated.job_id);

            runQueryHelper(job.data, function (err) {
                if (err) {
                    return done(err);
                }

                jobCanceller.cancel(job, function (err) {
                    if (err) {
                        return done(err);
                    }

                    done();
                });
            });
        });
    });

    it('.cancel() a non running job should not return an error', function (done) {
        var job = createWadusJob();

        jobCanceller.cancel(job, function (err) {
            if (err) {
                return done(err);
            }

            done();
        });
    });
});
