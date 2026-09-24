package main

import (
	"context"
	"testing"
	"time"

	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
)

func TestQuotaCooldownSelectorAutoRecoversExhaustedAccounts(t *testing.T) {
	manager := coreauth.NewManager(nil, &coreauth.RoundRobinSelector{}, nil)
	if _, err := manager.Register(context.Background(), &coreauth.Auth{
		ID:       "auth-quota.json",
		Provider: "codex",
		Status:   coreauth.StatusActive,
	}); err != nil {
		t.Fatalf("register auth: %v", err)
	}
	account := &accountSpec{
		ID:            "account-quota",
		AuthID:        "auth-quota.json",
		AuthKind:      "oauth",
		QuotaCooldown: &quotaCooldownState{Exhausted: true, UpdatedAtMS: time.Now().UnixMilli()},
	}
	m := &manifest{
		Accounts:        []accountSpec{*account},
		accountByID:     map[string]*accountSpec{"account-quota": account},
		accountByAuthID: map[string]*accountSpec{"auth-quota.json": account},
		quotaCooldowns:  newQuotaCooldownStateStore("", nil),
		authManager:     manager,
	}
	m.quotaCooldowns.snapshot.Store(map[string]quotaCooldownState{
		"account-quota": {Exhausted: true, UpdatedAtMS: time.Now().UnixMilli()},
	})
	selector := &quotaCooldownSelector{
		manifest: m,
		fallback: &cockpitSelector{manifest: m},
	}
	auth := &coreauth.Auth{ID: "auth-quota.json", Provider: "codex", Status: coreauth.StatusActive}

	selected, err := selector.Pick(context.Background(), "codex", "gpt-5.5", cliproxyexecutor.Options{}, []*coreauth.Auth{auth})
	if err != nil || selected == nil || selected.ID != "auth-quota.json" {
		t.Fatalf("expected auto-recovered quota account to be selectable, got auth=%#v err=%v", selected, err)
	}
	if accountQuotaExhausted(m, account, time.Now()) {
		t.Fatal("quota cooldown snapshot should be cleared after auto-recovery")
	}
}

func TestQuotaCooldownSelectorDoesNotRecoverDisabledAccounts(t *testing.T) {
	manager := coreauth.NewManager(nil, &coreauth.RoundRobinSelector{}, nil)
	account := &accountSpec{ID: "account-disabled", AuthID: "auth-disabled.json", AuthKind: "oauth"}
	m := &manifest{
		Accounts:        []accountSpec{*account},
		accountByID:     map[string]*accountSpec{"account-disabled": account},
		accountByAuthID: map[string]*accountSpec{"auth-disabled.json": account},
		authManager:     manager,
	}
	selector := &quotaCooldownSelector{
		manifest: m,
		fallback: &cockpitSelector{manifest: m},
	}
	auth := &coreauth.Auth{
		ID:       "auth-disabled.json",
		Provider: "codex",
		Status:   coreauth.StatusDisabled,
		Disabled: true,
	}
	if _, err := selector.Pick(context.Background(), "codex", "gpt-5.5", cliproxyexecutor.Options{}, []*coreauth.Auth{auth}); err == nil {
		t.Fatal("disabled accounts must stay unrecoverable")
	}
}

func TestPoolMemberRecoverableReasonAllowsQuotaCooldown(t *testing.T) {
	if !poolMemberRecoverableReason("quota_cooldown") {
		t.Fatal("quota_cooldown should be recoverable")
	}
	if !poolMemberRecoverableReason("account_cooldown") {
		t.Fatal("account_cooldown should be recoverable")
	}
	if poolMemberRecoverableReason("disabled") || poolMemberRecoverableReason("quota_reserved") {
		t.Fatal("disabled and quota_reserved must stay unrecoverable")
	}
}
