'use strict';

require('../helper');

const server = require('../../app/server')();
const assert = require('../support/assert');
const qs = require('querystring');
const BatchTestClient = require('../support/batch-test-client');
const { TYPES } = require('../../app/middlewares/log');

const QUERY = `SELECT 14 as foo`;
const API_KEY = 1234;

const logQueries = global.settings.logQueries;
const maxQueriesLogLength = global.settings.maxQueriesLogLength;

describe('Log middleware', function() {
    before(function() {
        global.settings.logQueries = true;
    });

    after(function() {
        global.settings.logQueries = logQueries;
    });

    describe('regular queries endpoint', function() {
        ['GET', 'POST'].forEach(method => {
            it(`${method} without query fails`, function(done) {
                assert.response(server,
                    {
                        method,
                        url: '/api/v1/sql?' + qs.stringify({
                            api_key: API_KEY
                        }),
                        headers: {
                            host: 'vizzuality.cartodb.com'
                        }
                    },
                    { statusCode: 400 },
                    function(err, res) {
                        assert.ok(!err);

                        assert.ok(res.headers['x-sqlapi-log']);
                        const log = JSON.parse(res.headers['x-sqlapi-log']);
                        assert.deepEqual(log, {
                            request: {
                                sql: null
                            }
                        });

                        return done();
                    }
                );
            });

            it(`${method} query`, function(done) {
                assert.response(server,
                    {
                        method,
                        url: '/api/v1/sql?' + qs.stringify({
                            q: QUERY,
                            api_key: API_KEY
                        }),
                        headers: {
                            host: 'vizzuality.cartodb.com'
                        }
                    },
                    { statusCode: 200 },
                    function(err, res) {
                        assert.ok(!err);

                        assert.ok(res.headers['x-sqlapi-log']);
                        const log = JSON.parse(res.headers['x-sqlapi-log']);
                        assert.deepEqual(log, {
                            request: {
                                sql: {
                                    type: TYPES.QUERY,
                                    sql: QUERY
                                }
                            }
                        });

                        return done();
                    }
                );
            });
        });
    });

    describe('batch api queries', function() {
        before(function() {
            this.batchTestClient = new BatchTestClient();
        });

        after(function(done) {
            this.batchTestClient.drain(done);
        });

        it('one query', function (done) {
            var payload = { query: QUERY };
            this.batchTestClient.createJob(payload, function(err, jobResult, res) {
                assert.ok(!err);

                assert.ok(res.headers['x-sqlapi-log']);
                const log = JSON.parse(res.headers['x-sqlapi-log']);
                assert.deepEqual(log, {
                    request: {
                        sql: {
                            type: TYPES.JOB,
                            sql: QUERY
                        }
                    }
                });

                return done();
            });
        });

        it('multiquery job with two queries', function (done) {
            var payload = { query: [QUERY, QUERY] };
            this.batchTestClient.createJob(payload, function(err, jobResult, res) {
                assert.ok(!err);

                assert.ok(res.headers['x-sqlapi-log']);
                const log = JSON.parse(res.headers['x-sqlapi-log']);
                assert.deepEqual(log, {
                    request: {
                        sql: {
                            type: TYPES.JOB,
                            sql: [QUERY, QUERY]
                        }
                    }
                });

                return done();
            });
        });
    });

    describe('disable queries log', function() {
        before(function() {
            global.settings.logQueries = false;
        });

        after(function() {
            global.settings.logQueries = true;
        });

        it(`GET query`, function(done) {
            assert.response(server,
                {
                    method: 'GET',
                    url: '/api/v1/sql?' + qs.stringify({
                        q: QUERY,
                        api_key: API_KEY
                    }),
                    headers: {
                        host: 'vizzuality.cartodb.com'
                    }
                },
                { statusCode: 200 },
                function(err, res) {
                    assert.ok(!err);

                    assert.ok(res.headers['x-sqlapi-log']);
                    const log = JSON.parse(res.headers['x-sqlapi-log']);
                    assert.deepEqual(log, {
                        request: {
                            sql: null
                        }
                    });

                    return done();
                }
            );
        });
    });

    describe('modify queries log length', function() {
        before(function() {
            global.settings.maxQueriesLogLength = 2;
        });

        after(function() {
            global.settings.maxQueriesLogLength = maxQueriesLogLength;
        });

        it(`GET query`, function(done) {
            assert.response(server,
                {
                    method: 'GET',
                    url: '/api/v1/sql?' + qs.stringify({
                        q: QUERY,
                        api_key: API_KEY
                    }),
                    headers: {
                        host: 'vizzuality.cartodb.com'
                    }
                },
                { statusCode: 200 },
                function(err, res) {
                    assert.ok(!err);

                    assert.ok(res.headers['x-sqlapi-log']);
                    const log = JSON.parse(res.headers['x-sqlapi-log']);
                    assert.deepEqual(log, {
                        request: {
                            sql: {
                                type: TYPES.QUERY.substring(0, global.settings.maxQueriesLogLength),
                                sql: QUERY.substring(0, global.settings.maxQueriesLogLength)
                            }
                        }
                    });

                    return done();
                }
            );
        });
    });
});
