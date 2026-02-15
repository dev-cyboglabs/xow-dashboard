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
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Logo and Title */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="videocam" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>XoW</Text>
          <Text style={styles.subtitle}>Booth Recording System</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isRegistering ? 'Register Device' : 'Sign In'}
          </Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Device ID</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Enter device ID"
                placeholderTextColor="#666"
                value={deviceId}
                onChangeText={setDeviceId}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
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
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          {isRegistering && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Booth Name</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Tech Expo - Booth A1"
                  placeholderTextColor="#666"
                  value={deviceName}
                  onChangeText={setDeviceName}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.loginButton}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>
                {isRegistering ? 'Register' : 'Sign In'}
              </Text>
            )}
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
                ? 'Already registered? Sign In'
                : 'New device? Register'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerText}>Secure Recording Platform</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#fff',
  },
  eyeIcon: {
    paddingRight: 16,
  },
  loginButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  footerLine: {
    width: 40,
    height: 4,
    backgroundColor: '#2D2D2D',
    borderRadius: 2,
    marginBottom: 12,
  },
  footerText: {
    color: '#4B5563',
    fontSize: 12,
  },
});
