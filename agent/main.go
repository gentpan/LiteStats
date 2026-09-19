package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type metrics map[string]any

type snapshot struct {
	at   time.Time
	idle uint64
	busy uint64
	rx   uint64
	tx   uint64
}

func main() {
	url := flag.String("url", env("LITESTATS_URL", ""), "LiteStats 地址，例如 https://stats.example.com")
	id := flag.String("id", env("LITESTATS_ID", ""), "服务器 ID")
	secret := flag.String("secret", env("LITESTATS_SECRET", ""), "服务器密钥")
	interval := flag.Int("interval", 15, "上报间隔（秒）")
	ping := flag.Bool("ping", env("LITESTATS_PING", "1") != "0", "探测电信/联通/移动延迟与丢包率")
	once := flag.Bool("once", false, "只采集上报一次后退出")
	printOnly := flag.Bool("print", false, "只打印采集结果，不上报")
	flag.Parse()

	if !*printOnly && (*url == "" || *id == "" || *secret == "") {
		fmt.Fprintln(os.Stderr, "litestats-agent 需要 --url --id --secret（或环境变量 LITESTATS_URL / LITESTATS_ID / LITESTATS_SECRET）")
		os.Exit(2)
	}
	if *interval < 5 {
		*interval = 5
	}

	endpoint := reportURL(*url)
	client := &http.Client{Timeout: 15 * time.Second}
	prev := collectSnapshot()
	time.Sleep(time.Second)

	report := func() {
		cur := collectSnapshot()
		body := collectMetrics(cur, prev)
		prev = cur
		if *ping {
			addPings(body)
		}
		if *printOnly {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			_ = enc.Encode(body)
			return
		}
		if err := post(client, endpoint, *id, *secret, body); err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
	}

	report()
	if *once {
		return
	}
	tick := time.NewTicker(time.Duration(*interval) * time.Second)
	defer tick.Stop()
	for range tick.C {
		report()
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func reportURL(raw string) string {
	u := strings.TrimRight(strings.TrimSpace(raw), "/")
	switch {
	case strings.HasSuffix(u, "/api/monitor/update"):
		return u
	case strings.HasSuffix(u, "/api/monitor"):
		return u + "/update"
	default:
		return u + "/api/monitor/update"
	}
}

func post(client *http.Client, endpoint, id, secret string, body metrics) error {
	payload, err := json.Marshal(map[string]any{
		"id":      id,
		"secret":  secret,
		"metrics": body,
	})
	if err != nil {
		return err
	}
	res, err := client.Post(endpoint, "application/json", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("上报失败: %w", err)
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	if res.StatusCode >= 300 {
		return fmt.Errorf("上报失败: HTTP %d", res.StatusCode)
	}
	return nil
}

func collectSnapshot() snapshot {
	idle, busy := cpuTicks()
	rx, tx := netBytes()
	return snapshot{at: time.Now(), idle: idle, busy: busy, rx: rx, tx: tx}
}

func collectMetrics(cur, prev snapshot) metrics {
	memTotal, memUsed := memoryMB()
	swapTotal, swapUsed := swapMB()
	diskTotal, diskUsed := diskMB()
	inSpeed, outSpeed := netSpeed(cur, prev)
	out := metrics{
		"cpu":            cpuPercent(cur, prev),
		"ram_total":      memTotal,
		"ram_used":       memUsed,
		"swap_total":     swapTotal,
		"swap_used":      swapUsed,
		"disk_total":     diskTotal,
		"disk_used":      diskUsed,
		"load_avg":       loadAvg(),
		"boot_time":      bootTimeMS(),
		"net_rx":         int64(cur.rx),
		"net_tx":         int64(cur.tx),
		"net_in_speed":   inSpeed,
		"net_out_speed":  outSpeed,
		"os":             osName(),
		"arch":           runtime.GOARCH,
		"kernel_version": kernelVersion(),
		"cpu_info":       cpuModel(),
		"cpu_cores":      runtime.NumCPU(),
		"processes":      processCount(),
		"tcp_conn":       connCount("tcp"),
		"udp_conn":       connCount("udp"),
	}
	return out
}

func cpuPercent(cur, prev snapshot) float64 {
	dIdle := diff(cur.idle, prev.idle)
	dBusy := diff(cur.busy, prev.busy)
	total := dIdle + dBusy
	if total == 0 {
		return 0
	}
	return float64(uint64(float64(dBusy)*10000/float64(total))) / 100
}

func netSpeed(cur, prev snapshot) (int64, int64) {
	dt := cur.at.Sub(prev.at).Seconds()
	if dt <= 0 {
		return 0, 0
	}
	return int64(float64(diff(cur.rx, prev.rx)) / dt), int64(float64(diff(cur.tx, prev.tx)) / dt)
}

func diff(cur, prev uint64) uint64 {
	if cur >= prev {
		return cur - prev
	}
	return 0
}

func cpuTicks() (idle, busy uint64) {
	if runtime.GOOS == "linux" {
		line := firstLinePrefix("/proc/stat", "cpu ")
		fields := strings.Fields(line)
		if len(fields) >= 8 {
			user := u64(fields[1])
			nice := u64(fields[2])
			sys := u64(fields[3])
			idle = u64(fields[4]) + u64(fields[5])
			busy = user + nice + sys + u64(fields[6]) + u64(fields[7])
			if len(fields) > 8 {
				busy += u64(fields[8])
			}
			return idle, busy
		}
	}
	out, err := exec.Command("sysctl", "-n", "kern.cp_time").Output()
	if err == nil {
		fields := strings.Fields(string(out))
		if len(fields) >= 4 {
			return u64(fields[3]), u64(fields[0]) + u64(fields[1]) + u64(fields[2])
		}
	}
	return 0, 0
}

func memoryMB() (total, used int64) {
	if runtime.GOOS == "linux" {
		info := readFile("/proc/meminfo")
		totalKB := meminfo(info, "MemTotal")
		availKB := meminfo(info, "MemAvailable")
		if availKB == 0 {
			availKB = meminfo(info, "MemFree") + meminfo(info, "Buffers") + meminfo(info, "Cached")
		}
		if totalKB > 0 {
			return totalKB / 1024, max64(totalKB-availKB, 0) / 1024
		}
	}
	if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
		total = i64(strings.TrimSpace(string(out))) / 1024 / 1024
		page := int64(4096)
		vm := string(run("vm_stat"))
		if m := regexp.MustCompile(`page size of (\d+) bytes`).FindStringSubmatch(vm); len(m) > 1 {
			if n, err := strconv.ParseInt(m[1], 10, 64); err == nil && n > 0 {
				page = n
			}
		} else if p, err := exec.Command("pagesize").Output(); err == nil {
			if n, err := strconv.ParseInt(strings.TrimSpace(string(p)), 10, 64); err == nil && n > 0 {
				page = n
			}
		}
		anon := vmPages(vm, "Anonymous pages")
		purgeable := vmPages(vm, "Pages purgeable")
		wired := vmPages(vm, "Pages wired down")
		compressed := vmPages(vm, "Pages occupied by compressor")
		if anon > 0 {
			usedPages := max64(anon-purgeable, 0) + wired + compressed
			used = min64(usedPages*page/1024/1024, total)
			return total, used
		}
		usedPages := vmPages(vm, "Pages active") + wired + compressed
		used = min64(usedPages*page/1024/1024, total)
		return total, used
	}
	return 0, 0
}

func swapMB() (total, used int64) {
	if runtime.GOOS == "linux" {
		info := readFile("/proc/meminfo")
		totalKB := meminfo(info, "SwapTotal")
		freeKB := meminfo(info, "SwapFree")
		return totalKB / 1024, max64(totalKB-freeKB, 0) / 1024
	}
	if out, err := exec.Command("sysctl", "-n", "vm.swapusage").Output(); err == nil {
		text := string(out)
		toMB := func(num, unit string) int64 {
			v, _ := strconv.ParseFloat(num, 64)
			switch strings.ToUpper(unit) {
			case "K":
				return int64(v / 1024)
			case "M":
				return int64(v)
			case "G":
				return int64(v * 1024)
			case "T":
				return int64(v * 1024 * 1024)
			}
			return int64(v)
		}
		var tot, usd int64
		if m := regexp.MustCompile(`total\s*=\s*([\d.]+)([KMGT])`).FindStringSubmatch(text); len(m) > 2 {
			tot = toMB(m[1], m[2])
		}
		if m := regexp.MustCompile(`used\s*=\s*([\d.]+)([KMGT])`).FindStringSubmatch(text); len(m) > 2 {
			usd = toMB(m[1], m[2])
		}
		return tot, usd
	}
	return 0, 0
}

func diskMB() (total, used int64) {
	out := run("df", "-kP", "/")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 2 {
		return 0, 0
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 3 {
		return 0, 0
	}
	return i64(fields[1]) / 1024, i64(fields[2]) / 1024
}

func netBytes() (rx, tx uint64) {
	if runtime.GOOS == "linux" {
		for _, line := range strings.Split(readFile("/proc/net/dev"), "\n")[2:] {
			parts := strings.Fields(strings.ReplaceAll(line, ":", " "))
			if len(parts) < 10 {
				continue
			}
			if skipIface(parts[0]) {
				continue
			}
			rx += u64(parts[1])
			tx += u64(parts[9])
		}
		return rx, tx
	}
	for _, line := range strings.Split(run("netstat", "-ibn"), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 10 || fields[0] == "Name" || !strings.Contains(fields[2], "Link") {
			continue
		}
		if skipIface(fields[0]) {
			continue
		}
		rx += u64(fields[6])
		tx += u64(fields[9])
	}
	return rx, tx
}

func skipIface(name string) bool {
	name = strings.TrimSuffix(name, ":")
	if name == "lo" || name == "lo0" || strings.HasPrefix(name, "lo") {
		return true
	}
	for _, prefix := range []string{"docker", "veth", "br-", "cni", "flannel", "calico", "virbr", "tun", "tap", "gif", "stf", "awdl", "llw", "utun", "bridge", "vmenet", "ap"} {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

func loadAvg() string {
	if runtime.GOOS == "linux" {
		fields := strings.Fields(readFile("/proc/loadavg"))
		if len(fields) >= 3 {
			return fields[0] + " " + fields[1] + " " + fields[2]
		}
	}
	out := strings.TrimSpace(run("sysctl", "-n", "vm.loadavg"))
	out = strings.Trim(out, "{}")
	return strings.Join(strings.Fields(out), " ")
}

func bootTimeMS() int64 {
	if runtime.GOOS == "linux" {
		if line := firstLinePrefix("/proc/stat", "btime "); line != "" {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return i64(fields[1]) * 1000
			}
		}
	}
	out := run("sysctl", "-n", "kern.boottime")
	if i := strings.Index(out, "sec = "); i >= 0 {
		rest := out[i+6:]
		if j := strings.IndexAny(rest, ",}"); j >= 0 {
			return i64(strings.TrimSpace(rest[:j])) * 1000
		}
	}
	return 0
}

func osName() string {
	if runtime.GOOS == "linux" {
		for _, line := range strings.Split(readFile("/etc/os-release"), "\n") {
			if strings.HasPrefix(line, "PRETTY_NAME=") {
				return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
			}
		}
		return "Linux"
	}
	if runtime.GOOS == "darwin" {
		name := strings.TrimSpace(run("sw_vers", "-productName"))
		ver := strings.TrimSpace(run("sw_vers", "-productVersion"))
		if name != "" {
			return strings.TrimSpace(name + " " + ver)
		}
		return "macOS"
	}
	return runtime.GOOS
}

func kernelVersion() string {
	return strings.TrimSpace(run("uname", "-s")) + " " + strings.TrimSpace(run("uname", "-r"))
}

func cpuModel() string {
	if runtime.GOOS == "linux" {
		for _, line := range strings.Split(readFile("/proc/cpuinfo"), "\n") {
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					return strings.TrimSpace(parts[1])
				}
			}
		}
	}
	if out := strings.TrimSpace(run("sysctl", "-n", "machdep.cpu.brand_string")); out != "" {
		return out
	}
	return "CPU"
}

func processCount() int64 {
	if runtime.GOOS == "linux" {
		entries, err := os.ReadDir("/proc")
		if err == nil {
			var n int64
			for _, entry := range entries {
				if isDigits(entry.Name()) {
					n++
				}
			}
			return n
		}
	}
	out := run("ps", "-A")
	return max64(int64(strings.Count(strings.TrimSpace(out), "\n")), 0)
}

func connCount(kind string) int64 {
	if runtime.GOOS == "linux" {
		key := "TCP"
		if kind == "udp" {
			key = "UDP"
		}
		for _, line := range strings.Split(readFile("/proc/net/sockstat"), "\n") {
			if strings.HasPrefix(line, key+":") {
				fields := strings.Fields(line)
				for i, field := range fields {
					if field == "inuse" && i+1 < len(fields) {
						return i64(fields[i+1])
					}
				}
			}
		}
	}
	proto := "tcp"
	if kind == "udp" {
		proto = "udp"
	}
	out := run("netstat", "-an")
	var n int64
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		if strings.HasPrefix(strings.ToLower(fields[0]), proto) {
			n++
		}
	}
	return n
}

func parsePing(output string) (float64, float64, bool) {
	lossMatch := regexp.MustCompile(`([\d.]+)%\s+packet loss`).FindStringSubmatch(output)
	if len(lossMatch) < 2 {
		return 0, 0, false
	}
	loss, err := strconv.ParseFloat(lossMatch[1], 64)
	if err != nil || loss < 0 || loss > 100 {
		return 0, 0, false
	}
	latency := -1.0
	avg := regexp.MustCompile(`(?:round-trip|rtt)[^=]*=\s*[\d.]+/([\d.]+)/`).FindStringSubmatch(output)
	if len(avg) > 1 {
		latency, _ = strconv.ParseFloat(avg[1], 64)
	}
	return latency, loss, true
}

func addPings(body metrics) {
	targets := map[string]string{"ping_ct": "202.96.128.86", "ping_cu": "210.22.84.3", "ping_cm": "211.136.17.107"}
	var wg sync.WaitGroup
	var mu sync.Mutex
	for key, host := range targets {
		wg.Add(1)
		go func(key, host string) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			wait := "1"
			if runtime.GOOS == "darwin" {
				wait = "1000"
			}
			cmd := exec.CommandContext(ctx, "ping", "-n", "-c", "3", "-W", wait, host)
			cmd.Env = append(os.Environ(), "LC_ALL=C")
			output, _ := cmd.Output()
			latency, loss, valid := parsePing(string(output))
			mu.Lock()
			defer mu.Unlock()
			body[key] = false
			body[key+"_target"] = host
			body[key+"_status"] = "unavailable"
			if valid {
				body[key+"_loss"] = loss
				body[key+"_status"] = "ok"
				if loss == 100 {
					body[key+"_status"] = "timeout"
				}
				if latency >= 0 {
					body[key] = latency
				}
			}
		}(key, host)
	}
	wg.Wait()
	body["ping_checked_at"] = time.Now().UTC().Format(time.RFC3339)
}

func meminfo(contents, key string) int64 {
	for _, line := range strings.Split(contents, "\n") {
		if strings.HasPrefix(line, key+":") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return i64(fields[1])
			}
		}
	}
	return 0
}

func vmPages(contents, key string) int64 {
	for _, line := range strings.Split(contents, "\n") {
		if strings.HasPrefix(line, key+":") {
			fields := strings.Fields(line)
			if len(fields) > 0 {
				return i64(strings.TrimSuffix(fields[len(fields)-1], "."))
			}
		}
	}
	return 0
}

func firstLinePrefix(path, prefix string) string {
	for _, line := range strings.Split(readFile(path), "\n") {
		if strings.HasPrefix(line, prefix) {
			return line
		}
	}
	return ""
}

func readFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func run(name string, args ...string) string {
	out, err := exec.Command(name, args...).Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func u64(raw string) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	return n
}

func i64(raw string) int64 {
	return int64(u64(raw))
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
