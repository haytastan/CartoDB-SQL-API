const PSQL = require('cartodb-psql');
const copyTo = require('pg-copy-streams').to;
const copyFrom = require('pg-copy-streams').from;
const { Client } = require('pg');

const ACTION_TO = 'to';
const ACTION_FROM = 'from';

module.exports = class StreamCopy {
    constructor(sql, userDbParams) {
        this.pg = new PSQL(userDbParams);
        this.sql = sql;
        this.stream = null;
    }

    static get ACTION_TO() {
        return ACTION_TO;
    }

    static get ACTION_FROM() {
        return ACTION_FROM;
    }

    getPGStream(action, cb) {
        this.pg.connect((err, client, done) => {
            if (err) {
                return cb(err);
            }

            let streamMaker = action === ACTION_TO ? copyTo : copyFrom;
            this.stream = streamMaker(this.sql);
            const pgstream = client.query(this.stream);

            pgstream
                .on('end', () => done())
                .on('error', err => done(err))
                .on('cancelQuery', err => {
                    if(action === ACTION_TO) {
                        // See https://www.postgresql.org/docs/9.5/static/protocol-flow.html#PROTOCOL-COPY
                        const cancelingClient = new Client(client.connectionParameters);
                        cancelingClient.cancel(client, pgstream);

                        // see https://node-postgres.com/api/pool#releasecallback
                        done(err);
                    } else if (action === ACTION_FROM) {
                        client.connection.sendCopyFail('CARTO SQL API: Connection closed by client');
                    }
                });

            cb(null, pgstream);
        });
    }

    getRowCount() {
        return this.stream.rowCount;
    }
};
