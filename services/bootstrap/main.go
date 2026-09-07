package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

func ticket(secret string) map[string]any {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	n := hex.EncodeToString(nonce)
	expires := time.Now().Add(2 * time.Minute).Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%s.%d", n, expires)
	return map[string]any{"nonce": n, "expires": expires, "signature": hex.EncodeToString(mac.Sum(nil))}
}
func main() {
	secret := os.Getenv("BOOTSTRAP_SECRET")
	if len(secret) < 32 {
		log.Fatal("BOOTSTRAP_SECRET must contain at least 32 random characters")
	}
	api := os.Getenv("NUTTY_API_URL")
	if api == "" {
		log.Fatal("NUTTY_API_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "5090"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})
	mux.HandleFunc("GET /v1/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{"apiUrl": api, "ticket": ticket(secret), "protocol": 1})
	})
	bind := os.Getenv("BOOTSTRAP_BIND")
	if bind == "" {
		bind = "127.0.0.1"
	}
	server := &http.Server{Addr: bind + ":" + port, Handler: mux, ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
	log.Printf("Nuttyinc bootstrap listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}
