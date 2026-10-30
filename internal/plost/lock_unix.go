//go:build darwin || linux

package plost

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

func lockDirectory(dir string) (*os.File, error) {
	f, err := os.OpenFile(filepath.Join(dir, "plost.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, errors.New("this data directory is already in use by another Plost process")
	}
	return f, nil
}
func unlockDirectory(f *os.File) {
	if f != nil {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}
}
