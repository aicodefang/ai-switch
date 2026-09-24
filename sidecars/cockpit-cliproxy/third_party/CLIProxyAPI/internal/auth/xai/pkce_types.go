package xai

// PKCECodes contains the OAuth 2.0 PKCE verifier and challenge.
type PKCECodes struct {
	CodeVerifier  string
	CodeChallenge string
}
