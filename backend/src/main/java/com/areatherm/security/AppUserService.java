package com.areatherm.security;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration and lookup for {@link AppUser}, plus the
 * {@link UserDetailsService} the JWT filter uses to turn a validated
 * token's email back into an authenticated principal. Password hashing
 * lives here (not in the controller) so {@code AppUser.passwordHash} is
 * never set from a raw password anywhere else.
 */
@Service
public class AppUserService implements UserDetailsService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final MailProperties mailProperties;

    public AppUserService(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder,
                           EmailService emailService, MailProperties mailProperties) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.mailProperties = mailProperties;
    }

    /**
     * @param role defaults to {@link AppUser.UserRole#ENGINEER} (matching the
     *             {@code app_user.role} column's own default) when null.
     * @throws EmailAlreadyRegisteredException if {@code email} is already taken --
     *         checked up front via {@link AppUserRepository#existsByEmail}, and
     *         also caught around the save itself so a concurrent registration
     *         racing past that check still surfaces as this exception rather
     *         than a raw {@link DataIntegrityViolationException} from the
     *         table's unique constraint.
     */
    @Transactional
    public AppUser register(String email, String displayName, String rawPassword, AppUser.UserRole role) {
        if (appUserRepository.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException(email);
        }

        AppUser user = new AppUser();
        user.setEmail(email);
        user.setDisplayName(displayName);
        user.setRole(role != null ? role : AppUser.UserRole.ENGINEER);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        applyFreshVerificationCode(user);

        AppUser saved;
        try {
            saved = appUserRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            throw new EmailAlreadyRegisteredException(email, ex);
        }
        emailService.sendVerificationCodeAsync(saved.getEmail(), saved.getVerificationCode());
        return saved;
    }

    /**
     * @throws InvalidVerificationCodeException if the email is unknown, the
     *         code doesn't match, or it's expired -- deliberately one generic
     *         outcome for all three so this endpoint never reveals whether a
     *         given email is registered.
     */
    @Transactional
    public AppUser verifyEmail(String email, String code) {
        AppUser user = appUserRepository.findByEmail(email).orElse(null);
        if (user == null || user.getVerificationCode() == null
                || !user.getVerificationCode().equals(code)
                || user.getVerificationCodeExpiresAt() == null
                || user.getVerificationCodeExpiresAt().isBefore(LocalDateTime.now())) {
            throw new InvalidVerificationCodeException();
        }
        user.setEmailVerified(true);
        user.setVerificationCode(null);
        user.setVerificationCodeExpiresAt(null);
        return appUserRepository.save(user);
    }

    /** Silently no-ops on an unknown email -- never reveals whether it's registered. */
    @Transactional
    public void resendVerificationCode(String email) {
        AppUser user = appUserRepository.findByEmail(email).orElse(null);
        if (user == null || user.isEmailVerified()) {
            return;
        }
        applyFreshVerificationCode(user);
        appUserRepository.save(user);
        emailService.sendVerificationCodeAsync(user.getEmail(), user.getVerificationCode());
    }

    private void applyFreshVerificationCode(AppUser user) {
        user.setVerificationCode(String.format("%06d", RANDOM.nextInt(1_000_000)));
        user.setVerificationCodeExpiresAt(LocalDateTime.now().plusMinutes(mailProperties.getVerificationCodeExpiryMinutes()));
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByEmail(String email) {
        return appUserRepository.findByEmail(email);
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        AppUser user = appUserRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("No user registered with email " + email));
        return new AppUserPrincipal(user);
    }
}
