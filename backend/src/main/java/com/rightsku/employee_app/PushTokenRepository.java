package com.rightsku.employee_app;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {

    Optional<PushToken> findByToken(String token);

    List<PushToken> findByUserId(Long userId);

    /** Log out on a phone: only the signed-in account's own token is removed. */
    @Modifying
    @Query("delete from PushToken t where t.token = :token and t.userId = :userId")
    int deleteOwn(@Param("token") String token, @Param("userId") Long userId);

    /** Tokens Firebase says no longer exist (app removed, data cleared). */
    @Modifying
    @Query("delete from PushToken t where t.token in :tokens")
    int deleteTokens(@Param("tokens") Collection<String> tokens);
}
