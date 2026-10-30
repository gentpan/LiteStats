package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/plost-dev/plost/internal/plost"
)

var version = "0.1.0-dev"

func main() {
	addr := flag.String("listen", "127.0.0.1:3101", "HTTP listening address")
	data := flag.String("data", "./data", "Private data directory")
	origin := flag.String("origin", "", "Public origin, e.g. https://stats.example.com")
	proxy := flag.Bool("trust-proxy", false, "Trust a local reverse proxy that overwrites forwarding headers")
	showVersion := flag.Bool("version", false, "Print version")
	memory := flag.Int("memory", 64, "Go runtime soft memory limit in MiB (not a total process limit)")
	flag.Parse()
	if *showVersion {
		fmt.Println("Plost", version)
		return
	}
	if *memory > 0 {
		debug.SetMemoryLimit(int64(*memory) << 20)
	}
	app, err := plost.Open(plost.Config{DataDir: *data, Origin: *origin, TrustProxy: *proxy, Version: version})
	if err != nil {
		log.Fatal("Cannot open Plost: ", err)
	}
	defer app.Close()
	srv := &http.Server{Addr: *addr, Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	log.Printf("Plost %s listening on %s", version, *addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("HTTP server: ", err)
	}
}
