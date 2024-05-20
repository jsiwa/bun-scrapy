import { Database } from 'bun:sqlite'

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class CreateDB {
  private db: Database

  constructor(dbName: string, enableWAL: boolean = false) {
    this.db = new Database(`${dbName}.db`, { create: true })
    if (enableWAL) {
      this.db.exec('PRAGMA journal_mode = WAL;')
    }
  }

  createTable(tableName: string, fields: string, indices?: { name: string, columns: string }[]): this {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new DatabaseError(`Invalid table name: ${tableName}`)
    }
    const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (${fields})`
    this.run(createTableSQL)

    if (indices) {
      for (const index of indices) {
        const createIndexSQL = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${tableName} (${index.columns})`
        this.run(createIndexSQL)
      }
    }

    return this
  }

  createIndex(tableName: string, indexName: string, columnNames: string): this {
    const createIndexSQL = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnNames})`
    this.run(createIndexSQL)
    return this
  }

  bulkInsert(tableName: string, data: Record<string, any>[]) {
    if (data.length === 0) return this

    const keys = Object.keys(data[0])
    const placeholders = keys.map(() => '?').join(', ')
    const columns = keys.join(', ')
    const insertSQL = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`

    try {
      this.db.exec('BEGIN TRANSACTION')
      const statement = this.db.prepare(insertSQL)
      for (const row of data) {
        statement.run(...Object.values(row))
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      console.error('Error executing bulk insert:', error)
      if (error instanceof Error)
        throw new DatabaseError(`Failed to execute bulk insert: ${error.message}`)
      throw error
    }
    return this
  }

  select(
    tableName: string,
    options: { condition?: string, params?: any[], orderBy?: string, limit?: number, offset?: number } = {}
  ): any[] {
    let querySQL = `SELECT * FROM ${tableName}`
    const { condition, params = [], offset, orderBy } = options
    const limit = options.limit || 20

    if (condition) {
      querySQL += ` WHERE ${condition}`
    }
    if (orderBy) {
      querySQL += ` ORDER BY ${orderBy}`
    }
    querySQL += ` LIMIT ${limit}`
    if (offset !== undefined) {
      querySQL += ` OFFSET ${offset}`
    }

    return this.all(querySQL, params)
  }

  insert(tableName: string, data: Record<string, any>): this {
    const keys = Object.keys(data)
    const placeholders = keys.map(() => '?').join(', ')
    const columns = keys.join(', ')
    const values = Object.values(data)

    const insertSQL = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`
    this.run(insertSQL, values)
    return this
  }

  count(tableName: string, condition?: string, params: any[] = []): number {
    let countSQL = `SELECT COUNT(*) as count FROM ${tableName}`;
    if (condition) {
      countSQL += ` WHERE ${condition}`;
    }
    const result = this.all(countSQL, params);
    return result[0]?.count || 0;
  }

  update(
    tableName: string,
    data: Record<string, any>,
    condition?: string,
    params: any[] = []
  ): this {
    const keys = Object.keys(data)
    const setClause = keys.map(key => `${key} = ?`).join(', ')
    const values = Object.values(data)

    let updateSQL = `UPDATE ${tableName} SET ${setClause}`
    if (condition) {
      updateSQL += ` WHERE ${condition}`
    }
    this.run(updateSQL, [...values, ...params])
    return this
  }

  delete(tableName: string, condition?: string, params: any[] = []): this {
    let deleteSQL = `DELETE FROM ${tableName}`
    if (condition) {
      deleteSQL += ` WHERE ${condition}`
    }
    this.run(deleteSQL, params)
    return this
  }

  exec(sql: string, params: any[] = []): void {
    this.run(sql, params)
  }

  private run(sql: string, params: any[] = []): void {
    try {
      const statement = this.db.prepare(sql)
      statement.run(...params)
    } catch (error) {
      console.error('Error executing query:', error)
      if (error instanceof Error)
        throw new DatabaseError(`Failed to execute query: ${error.message}`)
      throw error
    }
  }

  private all(sql: string, params: any[] = []): any[] {
    try {
      const statement = this.db.prepare(sql)
      return statement.all(...params)
    } catch (error) {
      console.error('Error executing query:', error)
      if (error instanceof Error)
        throw new DatabaseError(`Failed to execute query: ${error.message}`)
      throw error
    }
  }

  beginTransaction() {
    this.run('BEGIN TRANSACTION')
    return this
  }

  commitTransaction() {
    this.run('COMMIT')
    return this
  }

  rollbackTransaction() {
    this.run('ROLLBACK')
    return this
  }

  setPragma(pragma: string, value: string | number) {
    this.run(`PRAGMA ${pragma} = ${value}`)
    return this
  }

  close() {
    this.db.close()
  }
}
