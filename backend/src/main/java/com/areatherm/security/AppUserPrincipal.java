package com.areatherm.security;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Adapts {@link AppUser} to Spring Security's {@link UserDetails} contract
 * instead of using the library's own {@code User.withUsername(...)} builder,
 * so the rest of the request pipeline (the JWT filter today, an
 * {@code @AuthenticationPrincipal}-typed controller method tomorrow) can get
 * back the real {@link AppUser} -- id, display name, role -- rather than a
 * bare username/authorities pair. {@code email} is the Spring Security
 * "username". The single {@link AppUser#getRole()} value becomes a single
 * {@code ROLE_*} authority; no method security (@PreAuthorize etc.) reads it
 * yet, but the shape is in place for that follow-up.
 */
public class AppUserPrincipal implements UserDetails {

    private final AppUser appUser;

    public AppUserPrincipal(AppUser appUser) {
        this.appUser = appUser;
    }

    public AppUser getAppUser() {
        return appUser;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + appUser.getRole().name()));
    }

    @Override
    public String getPassword() {
        return appUser.getPasswordHash();
    }

    @Override
    public String getUsername() {
        return appUser.getEmail();
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
