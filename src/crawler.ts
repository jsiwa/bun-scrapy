import { unique } from './utils'
import { sleep } from 'bun'

interface ErrorHandler {
  (error: Error, url?: string): void
}

interface ItemProcessor {
  (html: string, url: string): void
}

interface EndHandler {
  (): void
}

interface BeforeRequestHandler {
  (url: string): boolean | Promise<boolean>
}

class Crawler {
  private taskQueue: string[] = []
  private active: boolean = false
  private paused: boolean = false
  private concurrency: number
  private activeRequests: number = 0
  private retries: number = 0
  private delay: number = 0 // Default delay is 0
  private errorHandler: ErrorHandler
  private itemProcessor: ItemProcessor
  private end: EndHandler
  private proxy: string | string[]
  private beforeRequestHandler: BeforeRequestHandler
  private cookies: string = ''
  private headers: Record<string, string> = {}

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency
    this.errorHandler = (error, url) => {
      console.error(`Error fetching ${url}:`, error)
    }
    this.itemProcessor = (_, url) => {
      console.log(`Processing content from ${url}`)
    }
    this.end = () => {
      console.log(`Crawler end`)
    }
    this.beforeRequestHandler = (_) => true  // Default to always continue
    this.proxy = ''
  }

  private async checkQueue() {
    while (this.active && !this.paused && this.activeRequests < this.concurrency && this.taskQueue.length > 0) {
      const url = this.taskQueue.shift()
      if (url) {
        const proceed = await this.beforeRequestHandler(url)
        if (proceed) {
          this.activeRequests++
          this.fetchPage(url, this.retries).finally(() => {
            this.activeRequests--
            if (this.active && !this.paused) {
              this.checkQueue()
            }
          })
        } else {
          console.log(`Before request handler blocked URL: ${url}`)
        }
      } else {
        this.end()
        await sleep(1000)
      }
    }
  }

  private async fetchPage(url: string, retries: number = 0) {
    if (this.delay > 0) {
      await sleep(this.delay)
    }

    try {
      const html = await this.fetchUrl(url)
      console.log(`Page fetched: ${url}`)
      this.itemProcessor(html, url)
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying ${url}, attempts left: ${retries}`);
        setTimeout(() => this.fetchPage(url, retries - 1), 1000)
      } else if (error instanceof Error) {
        this.errorHandler(error, url)
      } else {
        console.error(`Unexpected error type for ${url}:`, error)
      }
    }
  }

  private async fetchUrl(url: string): Promise<string> {
    let options: FetchRequestInit = {
      method: 'GET',
      headers: {
        ...this.headers,
        'Cookie': this.cookies,
      }
    }

    if (this.proxy) {
      if (typeof this.proxy === 'string') {
        options.proxy = this.proxy
      } else if (Array.isArray(this.proxy)) {
        const proxy = this.proxy[Math.floor(Math.random() * this.proxy.length)]
        if (proxy) {
          options.proxy = proxy
        }
      }
    }

    try {
      const response = await fetch(url, options)
      if (response.ok) {
        const data = await response.text()
        console.log(`Response received successfully from ${url}`)
        return data
      } else {
        throw new Error(`Request Failed. Status Code: ${response.status}`)
      }
    } catch (error) {
      if (error instanceof Error)
        throw new Error(`Failed to fetch ${url}: ${error.message}`)
      throw error
    }
  }

  public setProxy(proxy: string | string[]) {
    this.proxy = proxy
    return this
  }

  public setRetries(retries: number) {
    this.retries = retries
    return this
  }

  public setDelay(delay: number) {
    this.delay = delay
    return this
  }

  public setCookies(cookies: string) {
    console.log(`Setting cookies: ${cookies}`)
    this.cookies = cookies
    return this
  }

  public setHeaders(headers: Record<string, string>) {
    this.headers = headers
    return this
  }

  public addTask(url: string) {
    this.taskQueue.push(url)
    this.taskQueue = unique(this.taskQueue)
    if (this.active) {
      this.checkQueue()
    }
    return this
  }

  public start() {
    if (this.active) {
      console.log('Crawler is already running.');
      return this
    }
    this.active = true
    this.paused = false
    this.checkQueue()
    console.log('Crawler started.')
    return this
  }

  public stop() {
    this.active = false
    console.log('Crawler stopped.')
    return this
  }

  public pause() {
    this.paused = true
    console.log('Crawler paused.')
    return this
  }

  public resume() {
    if (this.active && this.paused) {
      this.paused = false
      this.checkQueue()
      console.log('Crawler resumed.')
    } else {
      console.log('Cannot resume crawler. It is either not active or not paused.')
    }
    return this
  }

  public onError(handler: ErrorHandler) {
    this.errorHandler = handler
    return this
  }

  public onItemProcess(processor: ItemProcessor) {
    this.itemProcessor = processor
    return this
  }

  public onEnd(endHandler: EndHandler) {
    this.end = endHandler
    return this
  }

  public beforeRequest(handler: BeforeRequestHandler) {
    this.beforeRequestHandler = handler
    return this
  }

  public getTaskCount() {
    return this.taskQueue.length
  }
}

export default Crawler
