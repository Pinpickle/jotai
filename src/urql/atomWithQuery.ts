import type {
  Client,
  OperationContext,
  OperationResult,
  RequestPolicy,
  TypedDocumentNode,
} from '@urql/core'
import { pipe, subscribe } from 'wonka'
import { atom } from 'jotai'
import type { Getter } from 'jotai'
import { clientAtom } from './clientAtom'

type QueryArgs<Data, Variables extends object> = {
  query: TypedDocumentNode<Data, Variables> | string
  variables?: Variables
  requestPolicy?: RequestPolicy
  context?: Partial<OperationContext>
}

export function atomWithQuery<Data, Variables extends object>(
  createQueryArgs: (get: Getter) => QueryArgs<Data, Variables>,
  getClient: (get: Getter) => Client = (get) => get(clientAtom)
) {
  const queryResultAtom = atom((get) => {
    const client = getClient(get)
    const args = createQueryArgs(get)
    let resolve: ((result: OperationResult<Data, Variables>) => void) | null =
      null
    const resultAtom = atom<
      | OperationResult<Data, Variables>
      | Promise<OperationResult<Data, Variables>>
    >(
      new Promise<OperationResult<Data, Variables>>((r) => {
        resolve = r
      })
    )
    let setResult: (result: OperationResult<Data, Variables>) => void = () => {
      throw new Error('setting result without mount')
    }
    const listener = (result: OperationResult<Data, Variables>) => {
      if (resolve) {
        resolve(result)
        resolve = null
      } else {
        setResult(result)
      }
    }
    if (client) {
      client
        .query(args.query, args.variables, {
          requestPolicy: args.requestPolicy,
          ...args.context,
        })
        .toPromise()
        .then(listener)
        .catch(() => {
          // TODO error handling
        })
    }
    resultAtom.onMount = (update) => {
      if (client) {
        setResult = update
        const subscription = pipe(
          client.query(args.query, args.variables, {
            requestPolicy: args.requestPolicy,
            ...args.context,
          }),
          subscribe(listener)
        )
        return () => subscription.unsubscribe()
      }
    }
    return { resultAtom, args }
  })
  const queryAtom = atom((get) => {
    const { resultAtom } = get(queryResultAtom)
    return get(resultAtom)
  })
  return queryAtom
}
