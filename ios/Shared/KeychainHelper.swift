import Foundation
import Security

public enum KeychainHelper {
    private static let service = "com.transfer.app.keychain"
    private static let accessGroup = "group.com.transfer.app"

    public static func save(key: String, data: Data) -> Bool {
        // Try with accessGroup first
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecAttrAccessGroup as String: accessGroup
        ]

        SecItemDelete(query as CFDictionary)
        var status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess { return true }

        // Fallback without accessGroup
        query.removeValue(forKey: kSecAttrAccessGroup as String)
        SecItemDelete(query as CFDictionary)
        status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    public static func load(key: String) -> Data? {
        // Try with accessGroup
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecAttrAccessGroup as String: accessGroup
        ]

        var item: CFTypeRef?
        var status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data { return data }

        // Fallback without accessGroup
        query.removeValue(forKey: kSecAttrAccessGroup as String)
        status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data { return data }

        return nil
    }

    public static func delete(key: String) {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(query as CFDictionary)

        query.removeValue(forKey: kSecAttrAccessGroup as String)
        SecItemDelete(query as CFDictionary)
    }

    public static func saveString(key: String, value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        return save(key: key, data: data)
    }

    public static func loadString(key: String) -> String? {
        guard let data = load(key: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
