// Package log provides structured logging using zerolog.
package log

import (
	"io"
	"os"
	"regexp"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

var sensitiveLogField = regexp.MustCompile(`(?i)("(?:secret|ee_link|dd_link|tg_link|https_link)"\s*:\s*"[^"]*"|\b(?:secret|ee_link|dd_link|tg_link|https_link)=\S+)`)

// redactingWriter prevents credential-bearing link fields from reaching system logs.
type redactingWriter struct {
	out io.Writer
}

func (w redactingWriter) Write(p []byte) (int, error) {
	redacted := sensitiveLogField.ReplaceAll(p, func(match []byte) []byte {
		text := string(match)
		if len(text) == 0 {
			return match
		}
		if text[0] == '"' {
			keyEnd := 0
			for i, ch := range text {
				if ch == ':' {
					keyEnd = i
					break
				}
			}
			if keyEnd > 0 {
				return []byte(text[:keyEnd+1] + `"[REDACTED]"`)
			}
		}
		if eq := stringIndexByte(text, '='); eq >= 0 {
			return []byte(text[:eq+1] + "[REDACTED]")
		}
		return []byte("[REDACTED]")
	})
	return w.out.Write(redacted)
}

func stringIndexByte(s string, target byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == target {
			return i
		}
	}
	return -1
}

var logger atomic.Pointer[zerolog.Logger]

func init() {
	l := zerolog.New(zerolog.ConsoleWriter{Out: redactingWriter{out: os.Stderr}, TimeFormat: time.RFC3339}).
		With().Timestamp().Logger().
		Level(zerolog.InfoLevel)
	logger.Store(&l)
}

func getLogger() *zerolog.Logger {
	return logger.Load()
}

// SetLevel sets the global log level.
func SetLevel(level string) {
	l := *getLogger()
	switch level {
	case "trace":
		l = l.Level(zerolog.TraceLevel)
	case "debug":
		l = l.Level(zerolog.DebugLevel)
	case "info":
		l = l.Level(zerolog.InfoLevel)
	case "warn", "warning":
		l = l.Level(zerolog.WarnLevel)
	case "error":
		l = l.Level(zerolog.ErrorLevel)
	case "fatal":
		l = l.Level(zerolog.FatalLevel)
	case "disabled", "none":
		l = l.Level(zerolog.Disabled)
	default:
		l = l.Level(zerolog.InfoLevel)
	}
	logger.Store(&l)
}

// SetJSON switches to JSON output format.
func SetJSON() {
	l := getLogger()
	newL := zerolog.New(redactingWriter{out: os.Stderr}).With().Timestamp().Logger().Level(l.GetLevel())
	logger.Store(&newL)
}

func Trace() *zerolog.Event { return getLogger().Trace() }
func Debug() *zerolog.Event { return getLogger().Debug() }
func Info() *zerolog.Event  { return getLogger().Info() }
func Warn() *zerolog.Event  { return getLogger().Warn() }
func Error() *zerolog.Event { return getLogger().Error() }
func Fatal() *zerolog.Event { return getLogger().Fatal() }
