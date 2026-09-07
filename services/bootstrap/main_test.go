package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

func TestSignedTicket(t *testing.T) {
	key := "a-test-key-that-is-at-least-32-bytes"
	got := ticket(key)
	mac := hmac.New(sha256.New, []byte(key))
	fmt.Fprintf(mac, "%s.%d", got["nonce"], got["expires"])
	if got["signature"] != hex.EncodeToString(mac.Sum(nil)) {
		t.Fatal("signature mismatch")
	}
	if got["expires"].(int64) <= time.Now().Unix() {
		t.Fatal("expired ticket")
	}
	if ticket(key)["nonce"] == got["nonce"] {
		t.Fatal("nonce reused")
	}
}
