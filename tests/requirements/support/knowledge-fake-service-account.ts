import { PROJECT_ID } from './emulator-env'

/**
 * Real handlers call `cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))`
 * unconditionally. `cert()` requires a syntactically valid PKCS8 private key
 * or it throws before any emulator routing happens — but once
 * FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set, the actual
 * Firestore/Auth Admin calls are routed to the loopback emulator and never
 * use this key to sign anything real. This is a syntactically valid but
 * inert RSA key: safe to commit, useless outside this offline demo project.
 */
const FAKE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDqvr6Pez+yaKzZ
uI/mhbaYcTIcS+HNrS1INiduUd4v2pvH+onYZtWWaBuZih/fN5XaGw6uIG71zw1u
RR1nYoqnGB3SdYklEr1F/8I4ngW+RrNGiOREWx/IH0JLOBrs8DF9LrFphsU5gGDV
k3SGlVcYak1gKl6kEX3X2mHLmcvLAHtriDVYrf6Jls+THo47Yy1gWt2pZc1LiVvs
m9bODtVvqOI3u36sTxKPyTBu3MHy+HUAt4eqv0dn/psg2Avi2hzmCzxDv7hapQ1B
U4xSN8Se+9i9RM1LSDE4zjmOxElu7j561DAg+k4Z2oL+GLyz6viKbncH7zRfBYRW
5L6rCv0ZAgMBAAECggEABTdy7orIAvsD9o5u68Zbs0OoQ5bTcEYop55TIapQMago
u7/kvDM2KORXC8ljSLXE56+f6Q7PkVUtNCz1IZlqne/fwx4nqAJPNepLC5RGFILL
Jhu8Vm9t+MQjSfQULKga6zdpsuN5/VDcFghJAncVBee1hF8SAQKbKpiMSJbWoyeX
MUPDiTAqRsY/DgnShERpEDbKLcLmBR3PXWSJzu4Cn6rKZ62zUEf9Bgyg2pLqWxg+
MQGnJRK3Wh6QjGSz4LvANoB+GIf5rUvpxWrrOZ3dwDIdFAvLKKg8Gv0ZHCPzgTsP
XL2Okpw3tcmlBSjDZBCmJsxhQPBd7sEqtUobmTITTwKBgQD2izNQfOro6sRON5Xz
8q0j6YQVB/uAq/LxKTymINLL46tN3gjgtqCAQa4DP2XL1Zz0MUjfHaYTAIYIShh7
9S/BVq3/MlI315GyNwVYlVzgDy/FQVAoHBGrT4dkM9BPG9Fk0bSmQvLpSr71Cgun
bqqabHf/QJ5R/Mfva3oWItIYCwKBgQDzv7GNye8kdHS6l2NHhqp0qBybC+IywxDb
45XcTyrAvm8jcD89fZKvwDyrWSAZyTENLuMaj8JxSAMB+fyO3YypJokbaY7I8+sj
ur4eKOIm/B6LqxEiTDIkHstcpG1ME/LNuSwUs7GT5Zf130TzsCzx+/bAb4r40qRy
fpWT0zCh6wKBgBRAFMPsrsLY3azrBecWrMABYzbzA+ZquTazw2aF1aqnlZ98uE/0
0DQYsPlVUMAwWIb6MVkaL1TqOxgdNeuglP6VZw9KC9TIYRA5UrgW9Jz2wl66YaIZ
xB3FF4LUeqy0xTs5ulPZtegRmqO34oMrJNowRJ7zqM1lLOrucgW1cHpHAoGBAJNf
KzLXDMe1wX2vWk88lILDwcfcf37Bgcfw6gKxut+eRAPhMdszuSSZzhSrZkUw539Z
AeZlVOK471ialKCsQwdiTTNNtw64q0qG9bu2bEW12aIIY+ugthAwrjPtFkgRJ5RK
iORbYNpSznXR8BaGRiZoeOAQkK2wbczry/P8lELRAoGAeE6bbAp1Su3w0YMnMuZe
LtO58LUzGgSZ196GFRP0zrI/4Z87o128SfUMCch0UEeXk7wToVv/TNm1W2f9JGCg
yUcFE3uoaVhGipMm6Q3exBWWzmcMKwM0PafJqg7Mr9HiB4ACFDmclRCgXasbfj4B
oAYBwIr4eo/IDDV7Ba9vhVA=
-----END PRIVATE KEY-----
`

export function fakeServiceAccountJson(): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'demo-key-id',
    private_key: FAKE_PRIVATE_KEY,
    client_email: `demo-suite@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    token_uri: 'https://oauth2.googleapis.com/token',
  })
}

/** Deliberately malformed so `JSON.parse` in the handler's `initFirebase()` throws. */
export const MALFORMED_SERVICE_ACCOUNT = '{not-json'
