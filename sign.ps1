$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=iChaveiro" -CertStoreLocation "Cert:\CurrentUser\My"
Set-AuthenticodeSignature -Certificate $cert -FilePath "C:\Users\fabia\iChaveiro\iChaveiro.exe"
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($cert)
$store.Close()
