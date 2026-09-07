import { InterceptingCall, status, type Interceptor, type CallInvocationTransformer } from '@grpc/grpc-js'
import type { Firestore } from 'firebase-admin/firestore'

/** Inject invalid credentials for one real source RPC, without changing its query. */
export function installSourceTransportFault(db: Firestore) {
  const fault = { collection: '', responsesFailed: 0 }
  const interceptor: Interceptor = (options, nextCall) => {
    return new InterceptingCall(nextCall(options), {
      start(metadata, _listener, next) {
        next(metadata, {
          onReceiveMetadata(value, onward) { onward(value) },
          onReceiveMessage(value, onward) { onward(value) },
          onReceiveStatus(value, onward) {
            if (value.code !== status.OK) fault.responsesFailed++
            onward(value)
          },
        })
      },
    })
  }
  const transform: CallInvocationTransformer = (call) => {
    const request = call.argument as { structuredQuery?: { from?: Array<{ collectionId?: string }> } }
    if (!fault.collection || !call.methodDefinition.path.endsWith('/RunQuery') ||
      !request?.structuredQuery?.from?.some((source) => source.collectionId === fault.collection)) return call
    const metadata = call.metadata.clone()
    metadata.set('authorization', 'Bearer SYNTHETIC_INVALID_EMULATOR_CREDENTIAL')
    return { ...call, metadata, callOptions: { ...call.callOptions, interceptors: [interceptor] } }
  }
  db.settings({ 'grpc.callInvocationTransformer': transform })
  return fault
}
