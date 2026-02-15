import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function LoginScreen() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        router.replace('/main');
      }
    } catch (error) {
      console.log('No existing login');
    }
  };

  const handleLogin = async () => {
    if (!deviceId.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter Device ID and Password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        device_id: deviceId.trim(),
        password: password.trim(),
      });

      if (response.data.success) {
        await AsyncStorage.setItem('xow_device', JSON.stringify(response.data.device));
        router.replace('/main');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        error.response?.data?.detail || 'Invalid Device ID or Password'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!deviceId.trim() || !password.trim() || !deviceName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        device_id: deviceId.trim(),
        password: password.trim(),
        name: deviceName.trim(),
      });

      Alert.alert('Success', 'Device registered successfully! You can now login.');
      setIsRegistering(false);
      setDeviceName('');
    } catch (error: any) {
      console.error('Register error:', error);
      Alert.alert(
        'Registration Failed',
        error.response?.data?.detail || 'Could not register device'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0a0a0f', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Logo and Title */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#e94560', '#ff6b6b']}
              style={styles.logoGradient}
            >
              <Ionicons name="videocam" size={40} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>XoW</Text>
          <Text style={styles.subtitle}>Expo Recording System</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Ionicons name="tablet-portrait-outline" size={22} color="#e94560" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Device ID"
              placeholderTextColor="#666"
              value={deviceId}
              onChangeText={setDeviceId}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={22} color="#e94560" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {isRegistering && (
            <View style={styles.inputContainer}>
              <Ionicons name="text-outline" size={22} color="#e94560" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Device Name (e.g., Booth-A1)"
                placeholderTextColor="#666"
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.loginButton}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#e94560', '#ff6b6b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={isRegistering ? 'person-add-outline' : 'log-in-outline'}
                    size={22}
                    color="#fff"
                  />
                  <Text style={styles.buttonText}>
                    {isRegistering ? 'Register Device' : 'Login'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsRegistering(!isRegistering);
              setDeviceName('');
            }}
          >
            <Text style={styles.switchText}>
              {isRegistering
                ? 'Already registered? Login'
                : 'New device? Register here'}
            </Text>
          </TouchableOpacity>

          {/* Dashboard Link for Web */}
          <TouchableOpacity
            style={styles.dashboardLink}
            onPress={() => router.push('/dashboard')}
          >
            <Ionicons name="analytics-outline" size={18} color="#e94560" />
            <Text style={styles.dashboardLinkText}>Open Dashboard</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure Expo Recording Platform</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 5,
    letterSpacing: 2,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(233,69,96,0.3)',
  },
  inputIcon: {
    paddingLeft: 15,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#fff',
  },
  eyeIcon: {
    paddingRight: 15,
  },
  loginButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#e94560',
    fontSize: 14,
  },
  dashboardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    gap: 8,
    paddingVertical: 10,
  },
  dashboardLinkText: {
    color: '#e94560',
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: '#444',
    fontSize: 12,
  },
});
